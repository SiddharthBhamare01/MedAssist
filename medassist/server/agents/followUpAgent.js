const { getPrimaryProvider } = require('../utils/aiClients');

const SYSTEM_PROMPT = `You are a medical follow-up scheduler. Given a patient's abnormal blood report findings and their current medication plan, recommend a follow-up testing schedule.

For each abnormal finding, recommend when to recheck and why.

Output ONLY valid JSON — an array with this structure:
[
  {
    "test": "Test name (e.g., Fasting Blood Glucose, Lipid Panel)",
    "recheck_in": "Time period (e.g., 2 weeks, 1 month, 3 months, 6 months)",
    "reason": "Brief reason for this follow-up timing",
    "priority": "urgent|routine|monitoring"
  }
]

Guidelines:
- Critical values: recheck in 1-2 weeks
- Significantly abnormal: recheck in 1-3 months
- Mildly abnormal: recheck in 3-6 months
- If on new medication: recheck relevant labs in 4-6 weeks
- IMPORTANT: Return ONLY the top 3 most important follow-up items — no more than 3
- Prioritize by clinical urgency (critical first)`;

/**
 * Run the follow-up recommendation agent (single-turn AI call).
 * @param {Object} params
 * @param {Array} params.abnormalFindings - from blood report analysis
 * @param {Array} params.tabletRecommendations - current medication plan
 * @returns {Array} follow-up schedule
 */
async function runFollowUpAgent({ abnormalFindings, tabletRecommendations }) {
  const provider = getPrimaryProvider();

  const userMessage = `Abnormal Findings:
${JSON.stringify(abnormalFindings, null, 2)}

Current Medication Plan:
${JSON.stringify(tabletRecommendations, null, 2)}

Generate a follow-up testing schedule.`;

  const response = await provider.client.chat.completions.create({
    model: provider.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 1200,
  });

  const content = response.choices[0]?.message?.content || '[]';

  // Extract JSON from response
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (err) {
    console.error('[followUpAgent] Failed to parse JSON:', content);
    return [
      {
        test: 'Comprehensive Metabolic Panel',
        recheck_in: '3 months',
        reason: 'General follow-up (AI response could not be parsed)',
        priority: 'routine',
      },
    ];
  }
}

module.exports = { runFollowUpAgent };
