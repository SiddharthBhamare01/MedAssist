const { runAgent, MAX_TURNS } = require('./agentRunner');
const { runEnsembleWithConsensus } = require('./ensembleRunner');
const { getProviders, getAvailableProviders } = require('../utils/aiClients');

const { definitions: allDefinitions, handlers } = require('./tools/medicalTools');
const pool = require('../db/pool');
const { getEmitter } = require('../utils/eventEmitter');

/**
 * Attempt to repair truncated JSON by closing open brackets/braces/strings.
 */
function repairTruncatedJSON(str) {
  // First try parsing as-is
  try { return JSON.parse(str); } catch {}

  // Remove trailing comma before attempting repairs
  let s = str.replace(/,\s*$/, '');

  // Track open brackets/braces/strings
  let inString = false;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }

  // Close open string
  if (inString) s += '"';
  // Close open brackets/braces
  while (stack.length > 0) {
    const open = stack.pop();
    // Remove trailing comma before closing
    s = s.replace(/,\s*$/, '');
    s += open === '{' ? '}' : ']';
  }

  try { return JSON.parse(s); } catch {}

  // Last resort: find the largest parseable prefix
  for (let end = s.length; end > 10; end--) {
    let attempt = s.slice(0, end).replace(/,\s*$/, '');
    // Auto-close
    let inStr = false, esc = false;
    const st = [];
    for (let i = 0; i < attempt.length; i++) {
      const c = attempt[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{' || c === '[') st.push(c);
      if (c === '}' || c === ']') st.pop();
    }
    if (inStr) attempt += '"';
    while (st.length) {
      const o = st.pop();
      attempt = attempt.replace(/,\s*$/, '');
      attempt += o === '{' ? '}' : ']';
    }
    try { return JSON.parse(attempt); } catch { continue; }
  }

  return null;
}

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

// Phase 2c — Dedicated treatment solutions with FDA-approved medications
const TREATMENT_SYSTEM = `You are a clinical pharmacologist. You MUST output ONLY valid JSON — no markdown fences, no explanation.

Your task: generate a treatment plan with FDA-approved medications personalized to the patient's medical history.

Output this EXACT structure:
{"treatment_solutions":[{"condition":"the abnormal finding being treated","medication":"FDA-approved drug name","generic_name":"generic/chemical name","dosage":"personalized dose based on patient weight/age/gender","frequency":"e.g. twice daily, every 8 hours","duration":"e.g. 4 weeks, 3 months, ongoing","route":"oral|topical|injection|inhaled","fda_approved":true,"evidence":"brief clinical rationale","precautions":"contraindications considering patient allergies and existing conditions"}]}

CRITICAL RULES:
- Generate 3-5 treatment solutions, one per abnormal condition
- ONLY FDA-approved medications — no supplements, no herbal remedies in this section
- Personalize dosage by patient weight (mg/kg), age, and gender
- Check patient allergies — NEVER recommend a drug the patient is allergic to
- Check existing medications — flag potential interactions
- Check existing conditions — adjust doses for renal/hepatic impairment if applicable
- Include duration: acute conditions (1-4 weeks), chronic conditions (ongoing with review date)
- If no medication is appropriate, recommend "Lifestyle modification + physician consult" with reason`;

/**
 * Get the OpenRouter provider specifically. Falls back to any available provider.
 */
function getOpenRouterOrFallback() {
  const providers = getProviders();
  const available = getAvailableProviders();

  // Prefer OpenRouter to avoid burdening primary providers
  if (available.includes('openrouter') && providers.openrouter?.client) {
    return providers.openrouter;
  }
  // Fallback: use last available provider (least loaded)
  if (available.length > 0) {
    const last = available[available.length - 1];
    return providers[last];
  }
  return null;
}

/**
 * Run treatment generation on OpenRouter with ensemble consensus.
 * Uses a dedicated judge to validate FDA approval and dosage safety.
 */
async function generateTreatmentSolutions(sharedContext, conditionsList, patientProfile) {
  const provider = getOpenRouterOrFallback();
  if (!provider) {
    console.warn('[bloodReportAgent] No provider available for treatment generation');
    return null;
  }

  const allergyWarning = patientProfile?.allergies?.length
    ? `\nPATIENT ALLERGIES (MUST AVOID): ${patientProfile.allergies.join(', ')}`
    : '';
  const medicationWarning = patientProfile?.current_medications?.length
    ? `\nCURRENT MEDICATIONS (CHECK INTERACTIONS): ${patientProfile.current_medications.join(', ')}`
    : '';
  const conditionWarning = patientProfile?.existing_conditions?.length
    ? `\nEXISTING CONDITIONS (ADJUST DOSES): ${patientProfile.existing_conditions.join(', ')}`
    : '';

  const treatmentUserMsg = `${sharedContext}
${allergyWarning}${medicationWarning}${conditionWarning}

Conditions requiring treatment: ${conditionsList}

Generate the treatment JSON now. Remember: FDA-approved drugs ONLY, personalized dosages.`;

  // Try ensemble if multiple providers available, otherwise single call
  const available = getAvailableProviders();
  if (available.length >= 2) {
    try {
      const { consensusRaw, agentCount } = await runEnsembleWithConsensus(
        TREATMENT_SYSTEM,
        treatmentUserMsg,
        'treatment_plan',
        3000
      );
      console.log(`[bloodReportAgent] Treatment ensemble (${agentCount} providers), length: ${consensusRaw.length}`);
      try {
        return JSON.parse(consensusRaw);
      } catch {
        const repaired = repairTruncatedJSON(consensusRaw);
        if (repaired) return repaired;
      }
    } catch (err) {
      console.warn('[bloodReportAgent] Treatment ensemble failed, trying single provider:', err.message);
    }
  }

  // Single-provider fallback: use OpenRouter directly
  try {
    const modelsToTry = provider.fallbackModels || [provider.model];
    let lastErr;
    for (const model of modelsToTry) {
      try {
        const response = await provider.client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: TREATMENT_SYSTEM },
            { role: 'user', content: treatmentUserMsg },
          ],
          temperature: 0.2,
          max_tokens: 3000,
        });
        const text = response.choices[0]?.message?.content || '';
        const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        try {
          return JSON.parse(clean);
        } catch {
          const repaired = repairTruncatedJSON(clean);
          if (repaired) return repaired;
        }
      } catch (err) {
        lastErr = err;
        if (err.status === 429 || err.status === 503 || err.status === 404) continue;
        throw err;
      }
    }
    console.warn('[bloodReportAgent] Treatment single-provider failed:', lastErr?.message);
  } catch (err) {
    console.warn('[bloodReportAgent] Treatment generation failed:', err.message);
  }

  return null;
}

/**
 * Run the Blood Report Agent (multi-phase: tool calls → medical → lifestyle → treatment).
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

  // ── Phase 2a: Medical sections — ensemble across all providers ───────────
  const toolSummary = steps.map((s) =>
    `${s.tool}(${JSON.stringify(s.args).slice(0, 80)}): ${JSON.stringify(s.result).slice(0, 200)}`
  ).join('\n');
  const conditionsList = abnormal.map((v) => v.parameter).join(', ');

  const sharedContext = `Patient: ${profileText}
Abnormal results: ${abnormalText}
Tool data: ${toolSummary || 'none'}`;

  emitter.emit('step', {
    tool: '_ensemble',
    args: {},
    result: { message: 'Running ensemble analysis: multiple AI providers generating medical plan…' },
    timestamp: new Date().toISOString(),
  });

  let medical = null;
  try {
    const { consensusRaw: raw2a, agentCount: ac2a } = await runEnsembleWithConsensus(
      PHASE2A_SYSTEM,
      `${sharedContext}\nConditions to address with tablets: ${conditionsList}\nGenerate the medical JSON now.`,
      'blood_analysis',
      4000
    );
    console.log(`[bloodReportAgent] Phase 2a ensemble (${ac2a} providers), length: ${raw2a.length}`);
    try {
      medical = JSON.parse(raw2a);
    } catch {
      // JSON truncated by token limit — attempt repair
      console.log('[bloodReportAgent] Phase 2a: attempting JSON repair...');
      medical = repairTruncatedJSON(raw2a);
      if (medical) {
        console.log(`[bloodReportAgent] Phase 2a: JSON repaired — tabs:${medical.tablet_recommendations?.length ?? 0}`);
      }
    }
  } catch (err) {
    console.error('[bloodReportAgent] Phase 2a ensemble failed:', err.message);
  }

  // ── Phase 2b: Lifestyle sections — ensemble ───────────────────────────────
  let lifestyle = null;
  try {
    const { consensusRaw: raw2b, agentCount: ac2b } = await runEnsembleWithConsensus(
      PHASE2B_SYSTEM,
      `${sharedContext}\nGenerate the diet and recovery JSON now.`,
      'blood_analysis',
      4000
    );
    console.log(`[bloodReportAgent] Phase 2b ensemble (${ac2b} providers), length: ${raw2b.length}`);
    try {
      lifestyle = JSON.parse(raw2b);
    } catch {
      console.log('[bloodReportAgent] Phase 2b: attempting JSON repair...');
      lifestyle = repairTruncatedJSON(raw2b);
      if (lifestyle) console.log('[bloodReportAgent] Phase 2b: JSON repaired');
    }
  } catch (err) {
    console.error('[bloodReportAgent] Phase 2b ensemble failed:', err.message);
  }

  // ── Phase 2c: Treatment solutions — dedicated OpenRouter call with ensemble ─
  emitter.emit('step', {
    tool: '_treatment',
    args: {},
    result: { message: 'Generating FDA-approved treatment plan with personalized dosages…' },
    timestamp: new Date().toISOString(),
  });

  let treatmentData = null;
  try {
    treatmentData = await generateTreatmentSolutions(sharedContext, conditionsList, patientProfile);
    console.log(`[bloodReportAgent] Phase 2c treatment — solutions:${treatmentData?.treatment_solutions?.length ?? 0}`);
  } catch (err) {
    console.error('[bloodReportAgent] Phase 2c treatment failed:', err.message);
  }

  console.log(`[bloodReportAgent] Final — tabs:${medical?.tablet_recommendations?.length ?? 0} treatment:${treatmentData?.treatment_solutions?.length ?? 0} diet:${!!lifestyle?.diet_plan} recovery:${lifestyle?.recovery_ingredients?.length ?? 0}`);

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
    treatment_solutions: treatmentData?.treatment_solutions || medical?.treatment_solutions || ['Consult a qualified physician for personalized treatment'],
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
