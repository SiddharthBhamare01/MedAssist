const { runAgent } = require('./agentRunner');
const { definitions, handlers } = require('./tools/medicalTools');
const { getEmitter } = require('../utils/eventEmitter');

const SYSTEM_INSTRUCTION = `You are a Doctor Assist AI for an educational medical informatics platform (CS 595).

Your job is a strict gap analysis: identify which essential blood tests for this patient's disease are NOT yet ordered.

YOUR WORKFLOW — follow in order, no skipping:

STEP 1 — Call lookup_icd_code for the chief complaint. Note the confirmed disease.

STEP 2 — Based on that disease, decide the SHORT list of essential tests (max 6). These must be the standard first-line tests a physician MUST order for this specific diagnosis — not nice-to-have extras.

STEP 3 — For each essential test, check whether it appears in the EXISTING TESTS list below. Be generous with matching: "HbA1c" matches "Hemoglobin A1c", "CBC" matches "Complete Blood Count", etc. Mark each as COVERED or MISSING.

STEP 4 — Call get_lab_reference_range only for tests you have marked MISSING.

STEP 5 — Write your final answer as a single JSON object in a markdown code block:

\`\`\`json
{
  "disease_confirmed": "Type 2 Diabetes Mellitus",
  "icd_code": "E11.9",
  "essential_tests": ["HbA1c", "Fasting Glucose", "Creatinine/GFR", "Lipid Panel"],
  "covered_tests": ["Fasting Glucose", "Lipid Panel"],
  "missing_tests": [
    {
      "test_name": "HbA1c",
      "reason": "Primary marker to confirm diabetes and assess 3-month glycemic control. Not equivalent to fasting glucose.",
      "urgency": "urgent",
      "reference_range": "Normal <5.7%; Prediabetes 5.7-6.4%; Diabetes >=6.5%"
    },
    {
      "test_name": "Creatinine / GFR",
      "reason": "Diabetes causes nephropathy; baseline kidney function must be established before starting metformin.",
      "urgency": "urgent",
      "reference_range": "Normal GFR >60 mL/min/1.73m2"
    }
  ]
}
\`\`\`

CRITICAL RULES:
- If a test in existing_tests covers the need (even by a different name), mark it COVERED — do NOT suggest it again.
- If ALL essential tests are already covered, missing_tests must be an empty array [].
- Only suggest tests that are 100% NOT in the existing_tests list after fuzzy matching.
- Do not suggest extras. Only the essential gap tests for this specific disease.
- Urgency: "critical" = immediate risk, "urgent" = order this visit, "routine" = next appointment.
- This is for educational purposes only.`;

/**
 * Run the Doctor Assist Agent.
 * Returns: { suggestions, coveredTests, essentialTests, diseaseConfirmed, icdCode, allCovered, steps, turns }
 */
async function runDoctorAssistAgent({ sessionId, patientCase, existingTests }) {
  const emitter = getEmitter(sessionId);

  const existingList = existingTests.length > 0
    ? existingTests.map((t, i) => `  ${i + 1}. ${t}`).join('\n')
    : '  (none ordered yet)';

  const userMessage = `
Patient Case:
- Age: ${patientCase.age}, Gender: ${patientCase.gender}
- Weight: ${patientCase.weight || 'N/A'} kg, Height: ${patientCase.height || 'N/A'} cm
- Chief Complaint: ${patientCase.chiefComplaint}
- Symptoms: ${patientCase.symptoms}
- Duration: ${patientCase.duration || 'not specified'}
- Known Conditions / History: ${patientCase.knownConditions || 'none reported'}

EXISTING TESTS ALREADY ORDERED (do NOT suggest these again):
${existingList}

Follow Steps 1-5 from your instructions. Be strict: only flag tests that are genuinely missing after fuzzy-matching against the existing list above.
`.trim();

  const { text, steps, turns } = await runAgent({
    systemInstruction: SYSTEM_INSTRUCTION,
    userMessage,
    tools: definitions,
    toolHandlers: handlers,
    onStep: (step) => emitter.emit('step', step),
    maxTokens: 3000,
  });

  // Parse structured JSON response
  let result = {
    disease_confirmed: '',
    icd_code: '',
    essential_tests: [],
    covered_tests: [],
    missing_tests: [],
  };

  try {
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      result = parsed;
    } else if (Array.isArray(parsed)) {
      // Fallback: old-format array response
      result.missing_tests = parsed.slice(0, 6);
    }
  } catch {
    // Try to extract JSON object from text
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { result = JSON.parse(objMatch[0]); } catch { /* ignore */ }
    }
    // Last resort: try array
    if (!result.missing_tests?.length) {
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try { result.missing_tests = JSON.parse(arrMatch[0]).slice(0, 6); } catch { /* ignore */ }
      }
    }
  }

  const suggestions   = (result.missing_tests   || []).slice(0, 6);
  const coveredTests  = result.covered_tests     || [];
  const essentialTests = result.essential_tests  || [];
  const allCovered    = suggestions.length === 0 && (coveredTests.length > 0 || essentialTests.length > 0);

  emitter.emit('done', { suggestions, allCovered });
  return {
    suggestions,
    coveredTests,
    essentialTests,
    diseaseConfirmed: result.disease_confirmed || '',
    icdCode:          result.icd_code || '',
    allCovered,
    steps,
    turns,
  };
}

module.exports = { runDoctorAssistAgent };
