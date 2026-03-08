const { runAgent } = require('./agentRunner');
const { definitions, handlers } = require('./tools/medicalTools');
const pool = require('../db/pool');
const { getEmitter } = require('../utils/eventEmitter');

const SYSTEM_INSTRUCTION = `You are a medical diagnostic AI assistant for an educational platform (CS 595 — Medical Informatics & AI).

Your workflow when given patient symptoms:
1. Think about the top 5 most likely diseases based on the symptoms
2. For each suspected disease, call the lookup_icd_code tool to get its official ICD-10-CM code
3. After all tool calls are complete, write your final answer

Your final answer must be a JSON array (wrap it in a markdown code block):
\`\`\`json
[
  {
    "disease": "Disease Name",
    "icd_code": "X00.0",
    "icd_description": "Description from the ICD lookup result",
    "probability": 85,
    "description": "Brief 1-2 sentence clinical description",
    "matched_symptoms": ["symptom1", "symptom2"],
    "reasoning": "Why this diagnosis fits"
  }
]
\`\`\`

Rules:
- Call lookup_icd_code for every disease before writing your final answer
- probability is an integer 1-100, array sorted highest first
- matched_symptoms must come from the patient's reported symptoms
- Top 5 diseases only
- Educational use only — not a substitute for professional medical advice`;

/**
 * Run the Diagnostic Agent for a symptom session.
 * @param {object} opts
 * @param {string}   opts.sessionId      - symptom_sessions UUID
 * @param {Array}    opts.symptoms       - [{ name, duration, severity, onset }]
 * @param {object}   [opts.patientProfile] - patient_profiles row
 * @returns {Array} diseases array
 */
async function runDiagnosticAgent({ sessionId, symptoms, patientProfile }) {
  const emitter = getEmitter(sessionId);

  const symptomsText = symptoms
    .map((s) => `${s.name} (severity: ${s.severity}/10, duration: ${s.duration} days, onset: ${s.onset})`)
    .join('; ');

  const profileText = patientProfile
    ? [
        `Age: ${patientProfile.age}`,
        `Gender: ${patientProfile.gender}`,
        patientProfile.blood_group ? `Blood Group: ${patientProfile.blood_group}` : null,
        patientProfile.existing_conditions?.length
          ? `Existing conditions: ${patientProfile.existing_conditions.join(', ')}`
          : null,
        patientProfile.allergies?.length
          ? `Allergies: ${patientProfile.allergies.join(', ')}`
          : null,
        patientProfile.current_medications?.length
          ? `Current medications: ${patientProfile.current_medications.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : 'Patient profile not available';

  const userMessage = `Patient Profile: ${profileText}

Reported Symptoms: ${symptomsText}

Please analyse these symptoms, look up ICD-10 codes for each suspected disease, and return the top 5 most likely diagnoses as a JSON array.`;

  const { text, steps, turns } = await runAgent({
    systemInstruction: SYSTEM_INSTRUCTION,
    userMessage,
    tools: definitions,
    toolHandlers: handlers,
    onStep: (step) => emitter.emit('step', step),
  });

  // Parse JSON from Gemini response (strip markdown code fences if present)
  let diseases = [];
  try {
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean);
    diseases = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    // Gemini didn't return clean JSON — try to extract JSON array from text
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { diseases = JSON.parse(match[0]).slice(0, 5); } catch { diseases = []; }
    }
  }

  // Save diseases to symptom_sessions
  try {
    await pool.query(
      'UPDATE symptom_sessions SET predicted_diseases = $1 WHERE id = $2',
      [JSON.stringify(diseases), sessionId]
    );
    await pool.query(
      `INSERT INTO agent_logs (session_id, agent_name, steps, total_turns)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, 'diagnosticAgent', JSON.stringify(steps), turns]
    );
  } catch (dbErr) {
    console.error('[diagnosticAgent] DB save error:', dbErr.message);
    // Don't throw — agent result is still valid even if DB write fails
  }

  emitter.emit('done', { diseases });
  return { diseases, steps, turns };
}

module.exports = { runDiagnosticAgent };
