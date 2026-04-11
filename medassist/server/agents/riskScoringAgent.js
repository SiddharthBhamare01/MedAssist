const { getPrimaryProvider } = require('../utils/aiClients');

const SYSTEM_PROMPT = `You are a clinical risk scoring calculator. Given a patient's blood report values and profile, compute a single composite health risk score.

Evaluate these clinical dimensions internally:
- Cardiovascular risk (Framingham-based: cholesterol, HDL, BP, smoking, diabetes)
- Diabetes risk (FINDRISC-based: age, BMI, glucose, BP history)
- Kidney function (CKD-EPI-based: creatinine, age, gender)
- Liver function (Child-Pugh-based: bilirubin, albumin, INR)

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
    { "area": "Liver", "score": <0-100>, "note": "short note" }
  ]
}

Be conservative — when in doubt, score higher (safer for patient). If data is missing for an area, estimate conservatively and note it.`;

/**
 * Run the risk scoring agent (single-turn AI call).
 * @param {Object} params
 * @param {Array} params.extractedValues - blood report values
 * @param {Object|null} params.patientProfile - patient profile data
 * @returns {Object} risk scores JSON
 */
async function runRiskScoringAgent({ extractedValues, patientProfile }) {
  const provider = getPrimaryProvider();

  const userMessage = `Patient Profile:
${patientProfile ? JSON.stringify(patientProfile, null, 2) : 'No profile available'}

Blood Report Values:
${JSON.stringify(extractedValues, null, 2)}

Calculate all applicable clinical risk scores.`;

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

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('[riskScoringAgent] Failed to parse JSON:', content);
    return {
      composite_score: null,
      risk_level: 'Unknown',
      hospital_visit: 'recommended_soon',
      summary: 'Unable to calculate risk score — please consult a doctor.',
      breakdown: [
        { area: 'Cardiovascular', score: null, note: 'Could not parse AI response' },
        { area: 'Diabetes', score: null, note: 'Could not parse AI response' },
        { area: 'Kidney', score: null, note: 'Could not parse AI response' },
        { area: 'Liver', score: null, note: 'Could not parse AI response' },
      ],
    };
  }
}

module.exports = { runRiskScoringAgent };
