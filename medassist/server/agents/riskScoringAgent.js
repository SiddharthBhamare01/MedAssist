const { getProviders, getAvailableProviders } = require('../utils/aiClients');

// Deterministic overall risk derived by rule from the anemia severity, so a
// moderate anemia can never render as "Low". Returns null when no hemoglobin
// was present (non-CBC report) — then the LLM composite is kept as-is.
const SEVERITY_RISK = {
  severe:   { score: 85, level: 'Critical', visit: 'immediate' },
  moderate: { score: 60, level: 'High',     visit: 'visit_within_2_weeks' },
  mild:     { score: 35, level: 'Moderate', visit: 'recommended_soon' },
};
function anemiaToRisk(anemia) {
  if (!anemia || anemia.hemoglobin?.value == null) return null;
  if (!anemia.anemia_present) return { score: 5, level: 'Low', visit: 'not_needed' };
  if (anemia.severity && SEVERITY_RISK[anemia.severity]) return SEVERITY_RISK[anemia.severity];
  // Anemic but severity unknown (e.g. inconclusive) — conservative High.
  return { score: 55, level: 'High', visit: 'visit_within_2_weeks' };
}

const NO_DATA_RE = /no\s+[\w-]*\s*data|not provided|cannot assess|unavailable|no relevant/i;

/**
 * Apply the deterministic anemia risk over the LLM's breakdown: override the
 * composite, drop no-data dimensions, and pin the Hematological tile to the rule.
 */
function applyDeterministicRisk(parsed, anemia) {
  const det = anemiaToRisk(anemia);
  if (!det) return parsed;

  parsed.composite_score = det.score;
  parsed.risk_level = det.level;
  parsed.hospital_visit = det.visit;
  parsed.rule_based = true; // overall risk derived deterministically from anemia severity

  let bd = Array.isArray(parsed.breakdown) ? parsed.breakdown : [];
  bd = bd.filter((b) => !NO_DATA_RE.test(b?.note || ''));

  const hemNote = anemia.anemia_present
    ? `${anemia.severity ? anemia.severity[0].toUpperCase() + anemia.severity.slice(1) + ' ' : ''}${anemia.type_label || 'anemia'} (Hb ${anemia.hemoglobin.value} g/dL) — scored by the rule engine.`
    : `No anemia (Hb ${anemia.hemoglobin.value} g/dL ≥ WHO cutoff ${anemia.hemoglobin.cutoff}).`;
  const hemEntry = { area: 'Hematological', score: det.score, note: hemNote };
  const i = bd.findIndex((b) => /hematolog/i.test(b?.area || ''));
  if (i >= 0) bd[i] = hemEntry; else bd.unshift(hemEntry);

  parsed.breakdown = bd;
  return parsed;
}

const SYSTEM_PROMPT = `You are a clinical risk scoring calculator. Given a patient's blood report values and profile, compute a single composite health risk score.

Evaluate ALL of the following clinical dimensions that are relevant to the available data:
- Cardiovascular risk (Framingham-based: total cholesterol, HDL, LDL, BP, smoking, diabetes history)
- Diabetes risk (FINDRISC-based: fasting glucose, HbA1c, age, BMI, BP history)
- Kidney function (CKD-EPI-based: creatinine, eGFR, age, gender)
- Liver function (Child-Pugh-based: bilirubin, albumin, ALT, AST, INR)
- Thyroid function risk (TSH deviation from normal, free T4, free T3, total T3, reverse T3, thyroid antibody titers — TPO, TgAb — and presence of hypothyroidism/hyperthyroidism pattern)
- Hematological risk (hemoglobin, hematocrit, RBC, MCV, MCH, MCHC — severity of anemia, type of anemia)
- Autoimmune / Inflammatory risk (ANA titer, elevated antibodies like TPO >100 IU/mL, TgAb, CRP, ESR, other inflammatory markers)

Composite score rules:
- Each dimension contributes to the final score based on severity and clinical significance.
- Thyroid: TSH >10 mIU/L or florid antibody elevation (TPO >500 IU/mL or TgAb >200 IU/mL) = score 60–80 for that area.
- Hematological: Hemoglobin <11 g/dL = score 50–70; <9 g/dL = score 70–90.
- Autoimmune: ANA positive + elevated thyroid antibodies = score 50–70 for that area.
- Include in "breakdown" ONLY dimensions that have supporting data in this report. Omit any dimension with no relevant data — do not emit zero-score placeholder tiles.

Then produce ONE composite score from 0–100 where:
- 0–25: Low risk (routine checkup sufficient)
- 26–50: Moderate risk (schedule a doctor visit within 1–2 months)
- 51–75: High risk (see a doctor within 1–2 weeks)
- 76–100: Critical risk (visit hospital immediately)

Output ONLY valid JSON with this structure:
{
  "composite_score": <number 0-100>,
  "risk_level": "Low|Moderate|High|Critical",
  "hospital_visit": "not_needed|recommended_soon|visit_within_2_weeks|immediate",
  "summary": "1-2 sentence plain English summary of overall risk",
  "breakdown": [
    { "area": "Cardiovascular", "score": <0-100>, "note": "short note" },
    { "area": "Diabetes", "score": <0-100>, "note": "short note" },
    { "area": "Kidney", "score": <0-100>, "note": "short note" },
    { "area": "Liver", "score": <0-100>, "note": "short note" },
    { "area": "Thyroid", "score": <0-100>, "note": "short note" },
    { "area": "Hematological", "score": <0-100>, "note": "short note" },
    { "area": "Autoimmune", "score": <0-100>, "note": "short note" }
  ]
}

Be conservative — when in doubt, score higher (safer for patient). Only include areas that have data in this report; do not pad the breakdown with empty dimensions.`;

/**
 * Run the risk scoring agent (single-turn AI call).
 * @param {Object} params
 * @param {Array} params.extractedValues - blood report values
 * @param {Object|null} params.patientProfile - patient profile data
 * @returns {Object} risk scores JSON
 */
async function runRiskScoringAgent({ extractedValues, patientProfile, anemia }) {
  const providers = getProviders();
  const available = getAvailableProviders();

  const anemiaAnchor = anemia && anemia.anemia_present
    ? `\nAUTHORITATIVE anemia severity from the rule engine: ${anemia.severity} (${anemia.type_label || anemia.type}). Anchor the Hematological dimension to it — mild≈30-45, moderate≈50-70, severe≈75-90 — do not deviate from this band.`
    : '';

  const userMessage = `Patient Profile:
${patientProfile ? JSON.stringify(patientProfile, null, 2) : 'No profile available'}

Blood Report Values:
${JSON.stringify(extractedValues, null, 2)}${anemiaAnchor}

Calculate all applicable clinical risk scores.`;

  let lastErr;
  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content;

      try {
        const parsed = JSON.parse(jsonStr);
        applyDeterministicRisk(parsed, anemia);
        console.log(`[riskScoringAgent] Success via ${provider.name} (composite ${parsed.composite_score}/${parsed.risk_level})`);
        return parsed;
      } catch {
        console.error(`[riskScoringAgent] ${provider.name} returned non-JSON:`, content.slice(0, 200));
        lastErr = new Error('Non-JSON response from risk scoring model');
        continue;
      }
    } catch (err) {
      if (err.status === 429 || err.status === 503 || err.status === 400 || err.status === 402 || err.status === 404) {
        console.warn(`[riskScoringAgent] ${provider.name} unavailable (${err.status}), trying next`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  console.error('[riskScoringAgent] All providers failed:', lastErr?.message);

  // Even with every LLM down, the deterministic anemia risk still stands.
  const det = anemiaToRisk(anemia);
  if (det) {
    const fallback = { composite_score: null, risk_level: null, hospital_visit: null, summary: '', breakdown: [] };
    applyDeterministicRisk(fallback, anemia);
    fallback.summary = anemia.explanation_seed || 'Anemia risk computed by the rule engine.';
    return fallback;
  }

  return {
    composite_score: null,
    risk_level: 'Unknown',
    hospital_visit: 'recommended_soon',
    summary: 'Unable to calculate risk score — please consult a doctor.',
    breakdown: [],
  };
}

module.exports = { runRiskScoringAgent, anemiaToRisk, applyDeterministicRisk };
