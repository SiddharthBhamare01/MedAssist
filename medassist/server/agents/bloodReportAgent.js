const { client: groq, MODEL } = require('../utils/aiClient');
const { runAgent, MAX_TURNS } = require('./agentRunner');

/** Retry a direct Groq call on 429 — same logic as agentRunner */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function groqCallWithRetry(params, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (err) {
      if (err.status === 429 && attempt < maxRetries) {
        const retryAfterSec = parseInt(err.headers?.['retry-after'] || '15', 10);
        const waitSec = Math.min(retryAfterSec + 1, 30);
        console.log(`[bloodReportAgent] Phase 2 rate limited. Waiting ${waitSec}s (retry ${attempt + 1}/${maxRetries})…`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw err;
    }
  }
}
const { definitions: allDefinitions, handlers } = require('./tools/medicalTools');
const pool = require('../db/pool');
const { getEmitter } = require('../utils/eventEmitter');

// Blood Report Agent only needs these 4 tools (not lookup_icd_code)
const TOOL_NAMES = ['get_lab_reference_range', 'search_drug_by_condition', 'get_drug_details', 'check_drug_interactions'];
const definitions = allDefinitions.filter((d) => TOOL_NAMES.includes(d.name));

// Phase 1 — simple tool-calling prompt (no JSON schema, avoids tool_use_failed)
// Limit tool calls to conserve TPM: max 3 abnormal params + 1 drug search + 1 drug detail
const PHASE1_SYSTEM = `You are a medical blood report analyzer. Call tools to gather clinical data.

Call tools in this order (keep it concise — max 5 tool calls total):
1. Call get_lab_reference_range for the TOP 3 most abnormal parameters only
2. Call search_drug_by_condition for the primary condition identified
3. Call get_drug_details for the top drug found

When all tool calls are done, respond with exactly: TOOLS_COMPLETE`;

// Phase 2a — medical sections only (summary + findings + tablets) ~1500 tokens output
const PHASE2A_SYSTEM = `You are a medical report formatter. Output ONLY valid JSON — no markdown, no extra text.

Output this exact structure:
{"summary":{"overall_assessment":"2-3 sentences","root_cause":"string","complexity":"Low|Medium|High","doctor_referral_needed":false,"referral_reason":null},"abnormal_findings":[{"parameter":"","your_value":"","normal_range":"","status":"high|low|critical_high|critical_low","interpretation":"1 sentence"}],"treatment_solutions":["advice 1","advice 2","advice 3"],"tablet_recommendations":[{"name":"","generic_name":"","dosage":"","frequency":"","duration":"","fda_approved":true,"contraindication_note":"","reason":""}]}

Rules: one tablet per abnormal condition (min 3 tablets), personalize dosage by weight/age, never use drugs patient is allergic to, doctor_referral_needed true if 3+ critical values.`;

// Phase 2b — lifestyle sections only (diet + recovery) ~1500 tokens output
const PHASE2B_SYSTEM = `You are a medical nutrition advisor. Output ONLY valid JSON — no markdown, no extra text.

Output this exact structure:
{"diet_plan":{"overview":"1 sentence","foods_to_eat":[{"food":"","reason":"","frequency":""}],"foods_to_avoid":[{"food":"","reason":""}],"meal_schedule":[{"meal":"Breakfast","suggestion":""},{"meal":"Lunch","suggestion":""},{"meal":"Dinner","suggestion":""},{"meal":"Snacks","suggestion":""}]},"recovery_ingredients":[{"ingredient":"","benefit":"","how_to_use":"","targets":[""]}]}

Rules: min 4 foods_to_eat, 3 foods_to_avoid, all 4 meal_schedule entries, min 3 recovery_ingredients. Target the specific abnormal parameters listed.`;

/**
 * Run the Blood Report Agent (two-phase: tool calls → JSON generation).
 */
async function runBloodReportAgent({ reportId, extractedValues, patientProfile }) {
  const emitter = getEmitter(reportId);

  const abnormal = extractedValues.filter((v) => v.status && v.status !== 'normal');
  const abnormalText = abnormal.length > 0
    ? abnormal.map((v) => `${v.parameter}: ${v.value} ${v.unit} (range: ${v.normal_range || 'N/A'}, status: ${v.status})`).join('\n')
    : 'No abnormal values detected.';

  const profileText = patientProfile
    ? [
        `Age: ${patientProfile.age || 'unknown'}`,
        `Gender: ${patientProfile.gender || 'unknown'}`,
        patientProfile.weight_kg    ? `Weight: ${patientProfile.weight_kg} kg`       : null,
        patientProfile.height_cm    ? `Height: ${patientProfile.height_cm} cm`       : null,
        patientProfile.blood_group  ? `Blood group: ${patientProfile.blood_group}`   : null,
        patientProfile.existing_conditions?.length
          ? `Existing conditions: ${patientProfile.existing_conditions.join(', ')}` : null,
        patientProfile.allergies?.length
          ? `Allergies: ${patientProfile.allergies.join(', ')}`                     : null,
        patientProfile.current_medications?.length
          ? `Current medications: ${patientProfile.current_medications.join(', ')}` : null,
        patientProfile.smoking_status ? `Smoking: ${patientProfile.smoking_status}` : null,
        patientProfile.alcohol_use    ? `Alcohol: ${patientProfile.alcohol_use}`     : null,
      ].filter(Boolean).join(' | ')
    : 'Not available';

  const userMessage = `Patient: ${profileText}

Abnormal results (${abnormal.length} of ${extractedValues.length} parameters):
${abnormalText}

Call the tools now to gather reference ranges and drug data.`;

  // ── Phase 1: Tool calls ───────────────────────────────────────────────────
  const { text: phase1Text, steps, turns } = await runAgent({
    systemInstruction: PHASE1_SYSTEM,
    userMessage,
    tools: definitions,
    toolHandlers: handlers,
    onStep: (step) => emitter.emit('step', step),
    maxTokens: 1500,
  });

  // ── Phase 2a: Medical sections (summary + abnormal + treatment + tablets) ─
  // Wait 3s to let the Groq TPM bucket partially recover after Phase 1
  await sleep(3000);

  const toolSummary = steps.map((s) =>
    `${s.tool}(${JSON.stringify(s.args).slice(0, 80)}): ${JSON.stringify(s.result).slice(0, 200)}`
  ).join('\n');
  const conditionsList = abnormal.map((v) => v.parameter).join(', ');

  const sharedContext = `Patient: ${profileText}
Abnormal results: ${abnormalText}
Tool data: ${toolSummary || 'none'}`;

  const phase2aResponse = await groqCallWithRetry({
    model: MODEL,
    messages: [
      { role: 'system', content: PHASE2A_SYSTEM },
      { role: 'user', content: `${sharedContext}\nConditions to address with tablets: ${conditionsList}\nGenerate the medical JSON now.` },
    ],
    temperature: 0.1,
    max_tokens: 2000,
  });

  const raw2a = phase2aResponse.choices[0].message.content.trim();
  console.log(`[bloodReportAgent] Phase 2a finish_reason: ${phase2aResponse.choices[0].finish_reason}, length: ${raw2a.length}`);

  let medical = null;
  try {
    const clean = raw2a.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    medical = JSON.parse(clean);
  } catch {
    const match = raw2a.match(/\{[\s\S]*\}/);
    if (match) { try { medical = JSON.parse(match[0]); } catch { medical = null; } }
  }

  // ── Phase 2b: Lifestyle sections (diet + recovery) ──────────────────────
  await sleep(3000);

  const phase2bResponse = await groqCallWithRetry({
    model: MODEL,
    messages: [
      { role: 'system', content: PHASE2B_SYSTEM },
      { role: 'user', content: `${sharedContext}\nGenerate the diet and recovery JSON now.` },
    ],
    temperature: 0.1,
    max_tokens: 2000,
  });

  const raw2b = phase2bResponse.choices[0].message.content.trim();
  console.log(`[bloodReportAgent] Phase 2b finish_reason: ${phase2bResponse.choices[0].finish_reason}, length: ${raw2b.length}`);

  let lifestyle = null;
  try {
    const clean = raw2b.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    lifestyle = JSON.parse(clean);
  } catch {
    const match = raw2b.match(/\{[\s\S]*\}/);
    if (match) { try { lifestyle = JSON.parse(match[0]); } catch { lifestyle = null; } }
  }

  console.log(`[bloodReportAgent] Final — tabs:${medical?.tablet_recommendations?.length ?? 0} diet:${!!lifestyle?.diet_plan} recovery:${lifestyle?.recovery_ingredients?.length ?? 0}`);

  // ── Merge results with fallbacks ─────────────────────────────────────────
  const doctorReferralNeeded = medical?.summary?.doctor_referral_needed || false;
  const analysis = {
    summary: medical?.summary || {
      overall_assessment: 'Analysis completed. Please consult a doctor for interpretation.',
      root_cause: 'Unable to parse agent response',
      complexity: 'Medium',
      doctor_referral_needed: true,
      referral_reason: 'AI response parsing failed — manual review recommended',
    },
    abnormal_findings: medical?.abnormal_findings || abnormal.map((v) => ({
      parameter: v.parameter,
      your_value: `${v.value} ${v.unit}`,
      normal_range: v.normal_range || 'N/A',
      status: v.status,
      interpretation: 'Manual review required',
    })),
    treatment_solutions: medical?.treatment_solutions || ['Consult a qualified physician'],
    diet_plan: lifestyle?.diet_plan || null,
    recovery_ingredients: lifestyle?.recovery_ingredients || [],
  };
  const tabletRecommendations = medical?.tablet_recommendations || [];

  // Save to DB
  try {
    await pool.query(
      `UPDATE blood_reports
       SET analysis = $1, tablet_recommendations = $2, complexity_flag = $3
       WHERE id = $4`,
      [JSON.stringify(analysis), JSON.stringify(tabletRecommendations), doctorReferralNeeded, reportId]
    );
    await pool.query(
      `INSERT INTO agent_logs (session_id, agent_name, steps, total_turns)
       VALUES ($1, $2, $3, $4)`,
      [reportId, 'bloodReportAgent', JSON.stringify(steps), turns]
    );
  } catch (dbErr) {
    console.error('[bloodReportAgent] DB save error:', dbErr.message);
    // Don't throw — analysis result is still valid even if DB write fails
  }

  emitter.emit('done', { analysis, tabletRecommendations, doctorReferralNeeded });
  return { analysis, tabletRecommendations, doctorReferralNeeded, steps, turns };
}

module.exports = { runBloodReportAgent };
