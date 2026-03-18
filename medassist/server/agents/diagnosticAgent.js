const { runAgent } = require('./agentRunner');
const { runEnsembleWithConsensus } = require('./ensembleRunner');
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

// Lightweight prompt for ensemble secondary agents (no tool calls needed)
const ENSEMBLE_SYSTEM = `You are a medical diagnostic AI for an educational platform (CS 595).
Given patient symptoms and profile, predict the top 5 most likely diseases.
Return ONLY a JSON array — no markdown, no explanation.
Each item: { "disease", "icd_code", "probability" (1-100), "description", "matched_symptoms", "reasoning" }
Sort by probability descending. Top 5 only. Educational use only.`;

/**
 * Run the Diagnostic Agent for a symptom session.
 * Phase 1: Primary agent with ICD tool calls → verified diagnosis
 * Phase 2: Ensemble cross-verification with other providers → consensus
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

  // ── Phase 1: Primary agent with ICD tool calls ────────────────────────────
  emitter.emit('step', { tool: '_system', args: {}, result: { message: 'Running primary diagnostic agent with ICD-10 tool calls…' }, timestamp: new Date().toISOString() });

  const { text, steps, turns } = await runAgent({
    systemInstruction: SYSTEM_INSTRUCTION,
    userMessage,
    tools: definitions,
    toolHandlers: handlers,
    onStep: (step) => emitter.emit('step', step),
  });

  // Parse primary agent result
  let primaryDiseases = [];
  try {
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean);
    primaryDiseases = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { primaryDiseases = JSON.parse(match[0]).slice(0, 5); } catch { primaryDiseases = []; }
    }
  }

  // ── Phase 2: Ensemble cross-verification ─────────────────────────────────
  let diseases = primaryDiseases;
  let ensembleAgentCount = 1;

  try {
    emitter.emit('step', {
      tool: '_ensemble',
      args: {},
      result: { message: 'Cross-verifying diagnosis with multiple AI providers…' },
      timestamp: new Date().toISOString(),
    });

    const ensembleUserMsg = `Patient Profile: ${profileText}\n\nReported Symptoms: ${symptomsText}\n\nPredict the top 5 most likely diseases as a JSON array.`;

    const { consensusRaw, agentCount, agentOutputs } = await runEnsembleWithConsensus(
      ENSEMBLE_SYSTEM,
      ensembleUserMsg,
      'disease_diagnosis',
      2000
    );

    ensembleAgentCount = agentCount + 1; // +1 for the primary agent

    // Merge: if ensemble ran multiple providers, use consensus; otherwise prefer primary (has ICD codes)
    if (agentCount > 1) {
      let consensusDiseases = [];
      try {
        const parsed = JSON.parse(consensusRaw);
        consensusDiseases = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
      } catch { /* keep primary */ }

      if (consensusDiseases.length > 0) {
        // Enrich consensus result with ICD codes from primary agent
        const icdMap = {};
        for (const d of primaryDiseases) {
          icdMap[d.disease?.toLowerCase()] = { icd_code: d.icd_code, icd_description: d.icd_description };
        }
        diseases = consensusDiseases.map((d) => {
          const key = d.disease?.toLowerCase();
          if (icdMap[key]) {
            return { ...d, icd_code: d.icd_code || icdMap[key].icd_code, icd_description: d.icd_description || icdMap[key].icd_description };
          }
          return d;
        });
        console.log(`[diagnosticAgent] Ensemble consensus from ${agentCount} providers applied`);
      }
    } else {
      // Only 1 ensemble provider — it's likely the same as primary; keep primary result (has ICD codes)
      console.log('[diagnosticAgent] Single ensemble provider — using primary result with ICD codes');
    }

    emitter.emit('step', {
      tool: '_ensemble',
      args: {},
      result: {
        message: `Ensemble complete: ${ensembleAgentCount} agents cross-verified. ${diseases.length} diseases in final result.`,
        providers: agentOutputs.map((a) => a.providerName),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (ensembleErr) {
    console.warn('[diagnosticAgent] Ensemble step failed, using primary result:', ensembleErr.message);
    // Fall back to primary result — no disruption to user
  }

  // Save to DB
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
  }

  emitter.emit('done', { diseases, ensembleAgentCount });
  return { diseases, steps, turns, ensembleAgentCount };
}

module.exports = { runDiagnosticAgent };
