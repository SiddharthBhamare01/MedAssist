const { client: groq, MODEL } = require('../utils/aiClient');

const SYSTEM_PROMPT = `You are a medical informatics AI assistant for an educational platform (CS 595).
Given a diagnosed disease and patient profile, recommend the most important blood tests a doctor would order.

Return ONLY a valid JSON array. No explanation outside the array.

Format:
[
  {
    "test_name": "Full name of the test",
    "abbreviation": "Short code e.g. CBC, HbA1c",
    "reason": "Why this test is ordered for the disease",
    "normal_range": "Typical reference range with units",
    "urgency": "essential | recommended | optional",
    "what_to_expect": "Brief patient-facing note (fasting, timing, etc.)"
  }
]

Rules:
- Return 5 to 8 tests maximum
- Sort by urgency: essential first, then recommended, then optional
- Keep language simple and educational
- Educational use only — not a substitute for professional medical advice`;

/**
 * Get recommended blood tests for a given disease.
 * @param {object} disease  - { disease, icd_code, description, ... }
 * @param {object} profile  - patient_profiles row (may be null)
 * @returns {Array} tests array
 */
async function getRecommendedBloodTests(disease, profile) {
  const profileText = profile
    ? [
        `Age: ${profile.age}`,
        `Gender: ${profile.gender}`,
        profile.blood_group ? `Blood Group: ${profile.blood_group}` : null,
        profile.existing_conditions?.length
          ? `Existing conditions: ${profile.existing_conditions.join(', ')}`
          : null,
        profile.current_medications?.length
          ? `Current medications: ${profile.current_medications.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : 'Profile not available';

  const userMessage = `Disease: ${disease.disease} (ICD-10: ${disease.icd_code})
Description: ${disease.description || 'N/A'}
Patient Profile: ${profileText}

List the key blood tests a doctor would order to confirm and monitor this condition.`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  const text = response.choices[0]?.message?.content || '[]';

  let tests = [];
  try {
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean);
    tests = Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { tests = JSON.parse(match[0]).slice(0, 8); } catch { tests = []; }
    }
  }

  return tests;
}

module.exports = { getRecommendedBloodTests };
