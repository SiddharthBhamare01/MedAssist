/**
 * diagnosticAgent.js — symptom pattern flagging (NOT diagnosis).
 *
 * Phase 2 faculty review (Dr. Leibovitz, Aug 2026):
 *
 *   "Inferring a condition from blood values without a clinician constitutes
 *    diagnosis and places the product within software-as-a-medical-device
 *    scope. Reframe the feature as pattern flagging plus questions for the
 *    clinician: the same interface, the same value, materially different risk."
 *
 * This agent previously returned "the top 5 most likely diseases" ranked by an
 * integer `probability` (0–100) with an ICD-10 code each. Presented to a patient
 * with no clinician in the loop, that is a diagnosis: it names a condition and
 * asserts a likelihood. "Type 2 Diabetes — 85%" also stops people looking.
 *
 * The reframe keeps the clinical value and drops the claim:
 *   - `probability` is gone. It is stripped deterministically below, not merely
 *     omitted from the prompt, because the rule engine decides what ships.
 *   - Conditions are "worth ruling out", not ranked by likelihood.
 *   - Every item carries questions for the clinician.
 *   - `icd_code` is retained as an internal reference only — POST /disease/tests
 *     uses it to look up relevant blood tests — and is labelled as such.
 *
 * The same interface, the same value, materially different risk.
 */

const { runEnsembleWithConsensus } = require('./ensembleRunner');

const DISCLAIMER =
  'This is not a diagnosis. These are patterns worth discussing with a clinician, ' +
  'listed alphabetically rather than by likelihood. Only a doctor who can examine ' +
  'you and order tests can determine what is actually causing your symptoms.';

const SYSTEM_PROMPT = `You are a medical informatics AI for an educational CS 595 platform.
Given a patient's symptoms (with severity 1-10, duration, and onset), identify up to 5 conditions a CLINICIAN would want to rule out, and the questions the patient should ask.

You are NOT diagnosing. You are preparing a patient to have a better conversation with a doctor.

Return ONLY a valid JSON array. No explanation outside the array.

Format:
[
  {
    "condition": "Condition name",
    "icd_code": "ICD-10 code e.g. E11",
    "icd_description": "ICD-10 description",
    "why_flagged": "Which symptom pattern makes this worth ruling out — 1 sentence",
    "matched_symptoms": ["symptom1", "symptom2"],
    "clinician_questions": ["A question the patient should ask their doctor about this"],
    "how_it_is_ruled_out": "What a clinician would typically do to confirm or exclude this — 1 sentence"
  }
]

Rules:
- Return at most 5 conditions, ordered ALPHABETICALLY by condition name — NOT by likelihood
- NEVER output a probability, percentage, likelihood, confidence, rank, or "most likely"
- NEVER state or imply that the patient has any of these conditions
- Include at least one clinician_question per condition, phrased for the patient to ask
- If the symptom pattern includes anything that warrants urgent assessment, say so in why_flagged
- icd_code is an internal reference for test lookup, not a diagnosis given to the patient
- Educational use only — not a substitute for professional medical advice`;

// Any key a model might use to smuggle a likelihood claim back in.
const BANNED_KEYS = [
  'probability', 'confidence', 'likelihood', 'percent', 'percentage',
  'score', 'rank', 'ranking', 'certainty', 'odds', 'risk_percent',
];

// Likelihood language in free text, e.g. "most likely", "85% chance".
// The percentage alternative sits outside the \b…\b group deliberately: a
// trailing word boundary never matches after "%", so "90% chance" would survive.
const LIKELIHOOD_PHRASE = /(\b(most likely|more likely|highly likely|likely to be|probably|probable cause|likelihood of|chance of|strongly suggests|indicates that you have|you (probably )?have)\b|\d{1,3}\s*%)/i;

/**
 * Drop whole sentences carrying a likelihood claim rather than word-substituting
 * inside them — patching "an 85% chance" into "an possibly" produces broken
 * prose, and a patient-facing string has to stay readable.
 */
function stripLikelihoodProse(text) {
  const sentences = String(text).match(/[^.!?]+[.!?]*/g) || [];
  const kept = sentences.filter((s) => !LIKELIHOOD_PHRASE.test(s)).join(' ').replace(/\s{2,}/g, ' ').trim();
  return kept;
}

/**
 * Strip every likelihood claim from one item. Deterministic — the reframe cannot
 * depend on the model having obeyed the prompt.
 */
function stripLikelihood(item) {
  const clean = { ...item };
  for (const key of Object.keys(clean)) {
    if (BANNED_KEYS.includes(key.toLowerCase())) delete clean[key];
  }
  for (const key of ['why_flagged', 'how_it_is_ruled_out', 'description']) {
    if (typeof clean[key] === 'string') {
      const kept = stripLikelihoodProse(clean[key]);
      // Every sentence made a likelihood claim — say nothing rather than
      // reconstruct a claim we just removed.
      clean[key] = kept || (key === 'why_flagged'
        ? 'Flagged from the reported symptom pattern; a clinician can say whether it applies.'
        : '');
    }
  }
  return clean;
}

/**
 * Run the Diagnostic Agent: symptoms → conditions a clinician may want to rule
 * out, each with questions for the patient to ask. Uses ensemble consensus.
 *
 * @param {Array} symptoms - [{ name, severity, duration, onset }, ...]
 * @param {object|null} profile - patient profile (may be null)
 * @returns {{ considerations, disclaimer, turns }}
 */
async function runDiagnosticAgent(symptoms, profile = null) {
  const symptomLines = symptoms.map((s) =>
    `- ${s.name}: severity ${s.severity}/10, duration ${s.duration} day(s), onset ${s.onset || 'not specified'}`
  ).join('\n');

  const profileText = profile
    ? [
        `Age: ${profile.age}`,
        `Gender: ${profile.gender}`,
        profile.blood_group ? `Blood Group: ${profile.blood_group}` : null,
        profile.existing_conditions?.length
          ? `Existing conditions: ${profile.existing_conditions.join(', ')}`
          : null,
        profile.allergies?.length
          ? `Allergies: ${profile.allergies.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : 'Profile not provided';

  const userMessage = `Patient Profile: ${profileText}

Symptoms:
${symptomLines}

List the conditions a clinician would want to rule out for this symptom pattern, alphabetically, with the questions this patient should ask their doctor about each.`;

  const { consensusRaw, agentCount } = await runEnsembleWithConsensus(
    SYSTEM_PROMPT,
    userMessage,
    'symptom_flagging',
    1800
  );

  let parsedItems = [];
  try {
    const parsed = JSON.parse(consensusRaw);
    parsedItems = Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = consensusRaw.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsedItems = JSON.parse(match[0]); } catch { parsedItems = []; }
    }
  }

  const considerations = parsedItems
    .slice(0, 5)
    .map(stripLikelihood)
    .map((d) => ({
      // `disease` is retained alongside `condition` so POST /disease/tests and
      // the session record keep working; both hold the same string.
      condition: d.condition || d.disease || 'Unknown',
      disease: d.condition || d.disease || 'Unknown',
      icd_code: d.icd_code || 'Z99',
      icd_description: d.icd_description || d.condition || d.disease || 'Unknown',
      why_flagged: d.why_flagged || d.reasoning || d.description || '',
      matched_symptoms: Array.isArray(d.matched_symptoms) ? d.matched_symptoms : [],
      clinician_questions: Array.isArray(d.clinician_questions) && d.clinician_questions.length
        ? d.clinician_questions
        : ['What would you need to check to confirm or rule this out for me?'],
      how_it_is_ruled_out: d.how_it_is_ruled_out || '',
      flagged_by_agents: d.consensus_count || agentCount,
    }))
    // Alphabetical by rule, so no ordering can be read as a likelihood ranking
    // even if the model ignored the instruction.
    .sort((a, b) => a.condition.localeCompare(b.condition));

  return { considerations, disclaimer: DISCLAIMER, turns: agentCount };
}

module.exports = { runDiagnosticAgent, DISCLAIMER, stripLikelihood };
