const router  = require('express').Router();
const https   = require('https');
const verifyToken = require('../middleware/auth');
const {
  getProviders, getAvailableProviders, getAvailableVoiceProviders,
  isProviderLimited, markProviderLimitedRPM,
} = require('../utils/aiClients');

const ELEVENLABS_VOICE_ID = 'W1TKxm4MpGXSlpN7iVQy';
const ELEVENLABS_MODEL    = 'eleven_turbo_v2';

// ── POST /api/voice/speak ───────────────────────────────────────────────────
// Body: { text: string }
// Returns: audio/mpeg binary
router.post('/speak', verifyToken, async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === 'your_elevenlabs_api_key_here') {
    return res.status(503).json({ error: 'ElevenLabs API key not configured. Add ELEVENLABS_API_KEY to .env' });
  }

  const body = JSON.stringify({
    text: text.slice(0, 3000),
    model_id: ELEVENLABS_MODEL,
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  });

  const options = {
    hostname: 'api.elevenlabs.io',
    path: `/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    method: 'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const elevReq = https.request(options, elevRes => {
    if (elevRes.statusCode !== 200) {
      let errData = '';
      elevRes.on('data', d => { errData += d; });
      elevRes.on('end', () => {
        console.error('[voice/speak] ElevenLabs error:', elevRes.statusCode, errData);
        res.status(502).json({ error: 'ElevenLabs TTS failed', details: errData });
      });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    elevRes.pipe(res);
  });

  elevReq.on('error', err => {
    console.error('[voice/speak] Request error:', err.message);
    res.status(502).json({ error: 'ElevenLabs connection failed' });
  });

  elevReq.write(body);
  elevReq.end();
});

// ─── POST /api/voice/narrate-report ────────────────────────────────────────
// Generates a doctor-style audio narration of the patient's blood report.
// Returns: audio/mpeg buffer
router.post('/narrate-report', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  const pool = require('../db/pool');

  let report;
  try {
    const { rows } = await pool.query(
      'SELECT analysis, extracted_values FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    report = rows[0];
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch report' });
  }

  const analysis = report.analysis || {};
  const summary = analysis.summary || {};
  const abnormal = analysis.abnormal_findings || [];

  const abnormalLines = abnormal.length > 0
    ? abnormal.slice(0, 6).map(f =>
        `- ${f.parameter}: ${f.your_value} (normal: ${f.normal_range}) — ${f.status}${f.interpretation ? `. ${f.interpretation}` : ''}`
      ).join('\n')
    : '- All values are within the normal range.';

  const scriptPrompt = `You are a warm, empathetic doctor speaking directly to a patient after reviewing their blood test results. Write a clear, calm 2-minute spoken narration (about 200-250 words) in this exact order:

1. GREETING — Start with a brief friendly greeting and tell the patient you have reviewed their blood report.
2. DIAGNOSIS / OVERALL FINDING — Explain what the report found overall: the likely root cause or condition identified, and how serious it is (complexity level). This is the most important part — speak about the diagnosis first.
3. ABNORMAL VALUES — Walk through the key abnormal findings one by one in plain English. For each one, say what the parameter does in the body, whether it is too high or too low, and what that means for the patient's health day-to-day.
4. LIFESTYLE TIPS — Give one or two simple, practical lifestyle suggestions based on the findings.
5. CLOSING — End with encouragement and a reminder to follow up with their doctor.

Do NOT use medical jargon. Do NOT say "your analysis shows" — speak naturally as if talking to the patient in person.
Do NOT include any JSON, bullet points, section headers, or formatting — just flowing spoken sentences.

Report data:
Overall assessment: ${summary.overall_assessment || 'Analysis complete.'}
Diagnosis / Root cause: ${summary.root_cause || 'Not clearly identified.'}
Severity: ${summary.complexity || 'Moderate'} complexity
Abnormal findings:
${abnormalLines}`;

  const providers = getProviders();
  const available = getAvailableProviders();

  let script = null;
  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: 'You write warm, plain-English medical narrations for patients. Output ONLY the spoken text, no formatting.' },
          { role: 'user', content: scriptPrompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
      });
      script = response.choices[0]?.message?.content?.trim();
      if (script) break;
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 429 || status === 503) continue;
      throw err;
    }
  }

  if (!script) {
    return res.status(503).json({ error: 'Could not generate narration script. Try again.' });
  }

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY === 'your_elevenlabs_api_key_here') {
    return res.status(500).json({ error: 'TTS not configured' });
  }

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: script,
          model_id: ELEVENLABS_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error('[voice/narrate-report] ElevenLabs error:', errText);
      return res.status(502).json({ error: 'TTS service error' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    const audioBuffer = await ttsRes.arrayBuffer();
    return res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('[voice/narrate-report] TTS fetch failed:', err.message);
    return res.status(502).json({ error: 'TTS request failed' });
  }
});


// Strip reasoning-model artifacts (same regex as translateSegment below).
function cleanExplanation(raw) {
  return (raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')  // qwen-3 / gpt-oss style think tokens
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

// Last resort for a max_tokens-truncated answer: cut back to the last complete
// sentence so the patient never sees a mid-word fragment.
function trimToLastSentence(text) {
  const i = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
  return i > 40 ? text.slice(0, i + 1) : text;
}

// ─── POST /api/voice/explain-finding ───────────────────────────────────────
// Returns a plain-English explanation of a single abnormal blood finding.
// Body: { reportId?, parameter, lang?, your_value?, normal_range?, status?, interpretation? }
//   reportId enables the persistent cache (and is the trusted source of the finding's
//   values). The your_value/normal_range/status/interpretation fields are only a
//   fallback for callers that have no reportId.
// Query: ?force=true regenerates and overwrites the cached text.
// Returns: { explanation: string, cached?: boolean }
router.post('/explain-finding', verifyToken, async (req, res) => {
  const pool = require('../db/pool');
  const { reportId, parameter, lang = 'en' } = req.body;
  if (!parameter) return res.status(400).json({ error: 'parameter is required' });

  // ── 1. Load the report (cache + trusted finding values) ──────────────────
  let report = null;
  if (reportId) {
    try {
      const { rows } = await pool.query(
        'SELECT analysis, finding_explanations FROM blood_reports WHERE id = $1 AND patient_id = $2',
        [reportId, req.user.userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Report not found' });
      report = rows[0];
    } catch (err) {
      // DB trouble shouldn't kill the feature — degrade to uncached generation.
      console.warn('[explain-finding] Cache lookup failed:', err.message);
    }
  }

  // ── 2. Cache hit ─────────────────────────────────────────────────────────
  const cached = report?.finding_explanations?.[lang]?.[parameter];
  if (cached && req.query.force !== 'true') {
    return res.json({ explanation: cached, cached: true });
  }

  // ── 3. Resolve the finding — server-side when we have the report ─────────
  let finding;
  if (report) {
    finding = (report.analysis?.abnormal_findings || []).find((f) => f.parameter === parameter);
    if (!finding) return res.status(404).json({ error: 'Finding not found in this report' });
  } else {
    // No reportId (or the lookup failed): fall back to the client-supplied values.
    const { your_value, normal_range, status, interpretation } = req.body;
    finding = { parameter, your_value, normal_range, status, interpretation };
  }

  const fStatus = finding.status || 'abnormal';
  const langNote = lang === 'es'
    ? '\n\nIMPORTANT: Write the entire explanation in Spanish (Español) only. Use simple, clear medical Spanish that a patient can understand.'
    : '';
  const interpNote = finding.interpretation
    ? `\n\nLab interpretation note (stay consistent with this): ${finding.interpretation}`
    : '';

  const prompt = `A patient's blood test shows: ${parameter} = ${finding.your_value} (normal range: ${finding.normal_range || 'not specified'}, status: ${fStatus}).

Write a 2-3 sentence plain-English explanation for the patient (no medical jargon) that covers:
1. What this parameter does in the body
2. What it means that it is ${fStatus}
3. One practical implication for daily life

Be warm, clear, and reassuring. Do not recommend specific treatments or drugs.
Keep the whole answer under 70 words and always finish your final sentence.${interpNote}${langNote}`;

  // ── 4. Generate — lightweight provider order, skipping benched providers ──
  const providers = getProviders();
  const voiceProviders = getAvailableVoiceProviders();
  const unlimited = voiceProviders.filter((n) => !isProviderLimited(n));
  // If everything is currently benched, try anyway rather than failing outright.
  const available = unlimited.length ? unlimited : voiceProviders;

  let explanation = null;
  let truncatedFallback = null;

  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: lang === 'es'
            ? 'Explicas resultados de análisis de sangre en español sencillo a pacientes. Sé conciso (2-3 oraciones), cálido y evita tecnicismos médicos.'
            : 'You explain blood test results in plain English to patients. Be concise (2-3 sentences), warm, and avoid jargon.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        // Generous cap: reasoning models (Cerebras gpt-oss-120b) charge their internal
        // reasoning tokens against max_tokens, so a tight cap leaves nothing for the
        // visible answer — that is what produced the truncated/stub explanations.
        // The prompt, not the cap, keeps the answer short.
        max_tokens: 1200,
      });

      const choice = response.choices[0];
      const text = cleanExplanation(choice?.message?.content);
      if (!text) {
        console.warn(`[explain-finding] ${name} returned empty content for "${parameter}" (finish_reason: ${choice?.finish_reason}) — trying next provider`);
        continue;
      }

      // Hit the cap — keep a trimmed copy but prefer a clean answer from the next provider.
      if (choice.finish_reason === 'length') {
        truncatedFallback = truncatedFallback || trimToLastSentence(text);
        console.warn(`[explain-finding] ${name} hit max_tokens for "${parameter}" — trying next provider`);
        continue;
      }

      explanation = text;
      break;
    } catch (err) {
      const httpStatus = err?.status || err?.response?.status;
      if (httpStatus === 429) markProviderLimitedRPM(name);
      // Always log — a silent failover makes a 503 impossible to diagnose.
      console.warn(`[explain-finding] ${name} failed (${httpStatus || 'no status'}): ${err.message}`);
      continue;  // 402/404/429/503 etc — fail over, never 500 the route
    }
  }

  // ── 5. Persist clean output only (a cached stub could never be invalidated) ──
  if (explanation && reportId && report) {
    pool.query(
      `UPDATE blood_reports
          SET finding_explanations =
              COALESCE(finding_explanations, '{}'::jsonb)
              || jsonb_build_object(
                   $1::text,
                   COALESCE(finding_explanations -> $1::text, '{}'::jsonb)
                   || jsonb_build_object($2::text, to_jsonb($3::text))
                 )
        WHERE id = $4 AND patient_id = $5`,
      [lang, parameter, explanation, reportId, req.user.userId]
    ).catch((e) => console.warn('[explain-finding] Could not cache explanation:', e.message));
  }

  if (explanation) return res.json({ explanation });

  if (truncatedFallback) {
    console.warn(`[explain-finding] Returning sentence-trimmed fallback for "${parameter}" (uncached)`);
    return res.json({ explanation: truncatedFallback });
  }

  console.error(`[explain-finding] All providers failed for "${parameter}" — tried: ${available.join(', ') || '(none configured)'}`);
  return res.status(503).json({ error: 'Could not generate explanation. Try again.' });
});


// ─── POST /api/voice/report-chat ───────────────────────────────────────────
// Conversational Q&A about an analyzed blood report.
// Body: { reportId, message, history: [{role, content}], lang }
// Returns: { reply: string }
router.post('/report-chat', verifyToken, async (req, res) => {
  const { reportId, message, history = [], lang = 'en' } = req.body;
  if (!reportId || !message) {
    return res.status(400).json({ error: 'reportId and message are required' });
  }

  const pool = require('../db/pool');
  let report;
  try {
    const { rows } = await pool.query(
      'SELECT analysis, extracted_values FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    report = rows[0];
  } catch {
    return res.status(500).json({ error: 'Failed to fetch report' });
  }

  const analysis = report.analysis || {};
  const summary = analysis.summary || {};
  const abnormal = analysis.abnormal_findings || [];
  const extractedValues = Array.isArray(report.extracted_values) ? report.extracted_values : [];

  const abnormalLines = abnormal.map(f =>
    `  • ${f.parameter}: ${f.your_value} (normal ${f.normal_range}) — ${f.status}${f.interpretation ? `. ${f.interpretation}` : ''}`
  ).join('\n') || '  • None — all values within normal range';

  const allValuesLine = extractedValues.length
    ? extractedValues.map(v => `${v.parameter}: ${v.value}${v.unit ? ' ' + v.unit : ''}`).join(', ')
    : '';

  const dietOverview = analysis.diet_plan?.overview || '';
  const eatList = (analysis.diet_plan?.foods_to_eat || []).slice(0, 5).map(f => f.food).join(', ');
  const avoidList = (analysis.diet_plan?.foods_to_avoid || []).slice(0, 5).map(f => f.food).join(', ');
  const ingredientsList = (analysis.recovery_ingredients || []).slice(0, 5).map(i => i.ingredient).join(', ');

  const langInstruction = lang === 'es'
    ? '\n\nIMPORTANT: Respond ONLY in Spanish (Español). Speak naturally as a Spanish-speaking doctor would to their patient. Use clear, simple medical Spanish.'
    : '';

  const systemPrompt = `You are Dr. MedAssist, a warm and experienced family doctor speaking directly with a patient about their blood test results. The patient just asked you a question — answer it the way a real doctor would in a face-to-face consultation.

HOW TO SPEAK:
- Always cite the patient's actual numbers (e.g. "Your hemoglobin came back at 10.2, which is below the normal range of 12–16...")
- Speak in natural, flowing sentences — never use bullet points, dashes, or lists
- Be specific to what was found in THIS report, not generic advice
- Keep your reply under 120 words unless the patient explicitly asks for more detail
- End with one short personal note, like "I'd suggest mentioning this at your next doctor's visit"
- Never say "based on your report" or "your analysis shows" — just speak naturally as a doctor would

ANSWER ONLY from the data below. If asked about something not in the report, say so naturally.${langInstruction}

── THIS PATIENT'S REPORT ──
Overall finding: ${summary.overall_assessment || 'Analysis complete'}
Diagnosis / root cause: ${summary.root_cause || 'Not clearly identified'}
Severity: ${summary.complexity || 'Moderate'} complexity
${summary.referral_reason ? `Why referral was recommended: ${summary.referral_reason}` : ''}

Abnormal values found:
${abnormalLines}
${allValuesLine ? `\nAll values from the test: ${allValuesLine}` : ''}
${dietOverview ? `\nDiet recommendation: ${dietOverview}` : ''}
${eatList ? `Good foods for this patient: ${eatList}` : ''}
${avoidList ? `Foods to avoid: ${avoidList}` : ''}
${ingredientsList ? `Helpful recovery ingredients: ${ingredientsList}` : ''}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  const providers = getProviders();
  const available = getAvailableProviders();

  let reply = null;
  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages,
        temperature: 0.6,
        max_tokens: 300,
      });
      reply = response.choices[0]?.message?.content?.trim();
      if (reply) break;
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 429 || status === 503) continue;
      throw err;
    }
  }

  if (!reply) {
    return res.status(503).json({ error: 'Could not generate response. Try again.' });
  }

  return res.json({ reply });
});

// ─── POST /api/voice/translate ─────────────────────────────────────────────
// Body: { lang: 'es', texts: { [key]: string } }
// Returns: { [key]: string }  (same keys, translated values)
// Splits large payloads into segments of 15 keys to avoid LLM max_tokens truncation.

const LANG_NAMES = { es: 'Spanish', fr: 'French', hi: 'Hindi', de: 'German', pt: 'Portuguese', zh: 'Chinese' };

async function translateSegment(textObj, langName, providers, available) {
  const systemPrompt = `You are a medical translation assistant. Translate values accurately, preserving clinical terminology.`;
  const userPrompt = `Translate ALL values in this JSON object from English to ${langName}.
Rules:
- Return ONLY valid JSON — no markdown fences, no explanation outside the JSON
- Keep every key exactly as-is, only translate the string values
- Preserve medical terms, drug names, and numeric references accurately
- If a value is already in ${langName}, keep it unchanged

${JSON.stringify(textObj)}`;

  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      });
      const raw = response.choices[0]?.message?.content?.trim() || '';
      const clean = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')  // strip qwen-3/reasoning model think tokens
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      return JSON.parse(clean);
    } catch (err) {
      console.error(`[translate] Provider ${name} segment failed:`, err.message);
      continue;
    }
  }
  return textObj; // English fallback for this segment only
}

router.post('/translate', verifyToken, async (req, res) => {
  const { lang, texts } = req.body;
  if (!lang || !texts || typeof texts !== 'object') {
    return res.status(400).json({ error: 'lang and texts are required' });
  }
  if (lang === 'en') return res.json(texts);

  const entries = Object.entries(texts).filter(([, v]) => v && typeof v === 'string' && v.trim());
  if (!entries.length) return res.json({});

  const langName = LANG_NAMES[lang] || lang;
  const providers = getProviders();
  const available = getAvailableVoiceProviders(); // GitHub gpt-4o-mini first — higher RPM than Cerebras

  // Split into segments of 15 keys — each segment stays well under 4096 output tokens
  const SEGMENT_SIZE = 15;
  const segments = [];
  for (let i = 0; i < entries.length; i += SEGMENT_SIZE) {
    segments.push(Object.fromEntries(entries.slice(i, i + SEGMENT_SIZE)));
  }

  // Sequential — avoids concurrent request limits on GitHub (5/s) and Cerebras
  const merged = {};
  for (const seg of segments) {
    const result = await translateSegment(seg, langName, providers, available);
    Object.assign(merged, result);
  }

  return res.json(merged);
});

module.exports = router;
