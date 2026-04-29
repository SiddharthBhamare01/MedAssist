/**
 * voice.js — Voice assistant backend for Patient Intake wizard
 *
 * POST /api/voice/speak  — proxies ElevenLabs TTS (keeps API key server-side)
 * POST /api/voice/parse  — Groq LLM parses spoken text → structured form JSON
 */

const router  = require('express').Router();
const https   = require('https');
const verifyToken = require('../middleware/auth');
const { getProviders, getAvailableProviders, getAvailableVoiceProviders } = require('../utils/aiClients');

const ELEVENLABS_VOICE_ID = 'W1TKxm4MpGXSlpN7iVQy'; // MedAssist custom voice
const ELEVENLABS_MODEL    = 'eleven_turbo_v2';

// ── callWithFallback — tries each provider in order until one succeeds ──────
// Handles 429 rate-limit by automatically moving to the next provider.
async function callWithFallback(messages, options = {}) {
  const available = getAvailableVoiceProviders();
  const providers = getProviders();
  let lastErr = null;

  for (const name of available) {
    const { client, model } = providers[name];
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: 0,
        max_tokens: 300,
        ...options,
      });
      return completion.choices[0].message.content.trim();
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 401 || status === 429 || status === 503) {
        console.warn(`[voice/parse] ${name} unavailable (${status}), trying next provider…`);
        lastErr = err;
        continue;
      }
      throw err;  // non-rate-limit errors bubble up immediately
    }
  }
  throw lastErr || new Error('All AI providers exhausted');
}

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
    text: text.slice(0, 1000),        // guard against huge strings
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

// ── Parsing prompts per step ────────────────────────────────────────────────
const PARSE_PROMPTS = {
  // Step 1 — basic info (single values per question)
  step1: `You are a medical intake assistant. The patient answered a question about their basic info.
Return ONLY a valid JSON object with these keys (set unknown values to null):
{"age":number|null,"gender":"male"|"female"|"other"|"prefer-not-to-say"|null,"weightKg":number|null,"heightCm":number|null,"bloodGroup":"A+"|"A-"|"B+"|"B-"|"AB+"|"AB-"|"O+"|"O-"|null}
Rules:
- Blood group: "A positive"→"A+", "O negative"→"O-", "AB positive"→"AB+"
- Gender: "man"/"male"/"boy"→"male"; "woman"/"female"/"girl"→"female"
- Only include keys that are clearly mentioned; set others to null
- Return ONLY the JSON, no other text`,

  // Step 2 field-specific prompts — one per question so the LLM is never confused
  conditions: `You are a medical intake assistant.
The patient listed their existing medical conditions.
Extract ALL conditions mentioned and return ONLY a JSON array of strings.
Match loosely to: Diabetes, Hypertension, Asthma, Heart Disease, Thyroid Disorder, Cancer, Arthritis, Kidney Disease.
If the patient says "none" or "no conditions", return [].
Examples: "I have diabetes and high blood pressure" → ["Diabetes","Hypertension"]
          "asthma and thyroid issues" → ["Asthma","Thyroid Disorder"]
          "none" → []
Return ONLY the JSON array, no other text.`,

  allergies: `You are a medical intake assistant.
The patient listed their allergies.
Extract EVERY allergy mentioned and return ONLY a JSON array of strings.
Each allergen should be a separate item in the array.
If the patient says "none" or "no allergies", return [].
Examples: "I am allergic to penicillin and sulfa" → ["Penicillin","Sulfa"]
          "pollen, dust and shellfish" → ["Pollen","Dust","Shellfish"]
          "none" → []
Return ONLY the JSON array, no other text.`,

  medications: `You are a medical intake assistant.
The patient listed their current medications.
Extract EVERY medication mentioned and return ONLY a JSON array of strings.
Each medication should be a separate item in the array.
If the patient says "none" or "no medications", return [].
Examples: "I take metformin and lisinopril" → ["Metformin","Lisinopril"]
          "aspirin, vitamin D and omeprazole" → ["Aspirin","Vitamin D","Omeprazole"]
          "none" → []
Return ONLY the JSON array, no other text.`,

  smoking: `You are a medical intake assistant.
The patient described their smoking status.
Return ONLY one of these exact strings (no quotes, no array, no JSON):
never
former
current
Rules: "never smoked"/"non-smoker"/"no" → never
       "used to"/"quit"/"ex-smoker"/"former" → former
       "smoke"/"smoker"/"yes"/"currently" → current
Return ONLY the single word, nothing else.`,

  alcohol: `You are a medical intake assistant.
The patient described their alcohol use.
Return ONLY one of these exact strings (no quotes, no array, no JSON):
none
occasional
regular
Rules: "don't drink"/"no alcohol"/"never"/"no" → none
       "sometimes"/"socially"/"occasionally"/"weekends" → occasional
       "regularly"/"daily"/"every day"/"often" → regular
Return ONLY the single word, nothing else.`,

  // Step 3 — symptom list (multiple symptoms in one answer)
  step3symptoms: `You are a medical intake assistant. The patient described all their current symptoms.
Extract EVERY symptom mentioned and return ONLY a JSON array using exact names from this list:
Fever, Fatigue, Weight Loss, Weight Gain, Night Sweats, Loss of Appetite, Weakness,
Headache, Dizziness, Confusion, Memory Loss, Seizures, Numbness / Tingling,
Chest Pain, Shortness of Breath, Palpitations, Cough, Wheezing,
Nausea, Vomiting, Diarrhea, Constipation, Abdominal Pain, Bloating, Heartburn,
Joint Pain, Muscle Pain, Back Pain, Swelling, Stiffness,
Rash, Itching, Yellowing (Jaundice), Pale Skin, Bruising,
Frequent Urination, Painful Urination, Blood in Urine, Increased Thirst, Blurred Vision
Rules:
- Match loosely: "stomach ache"→"Abdominal Pain", "throwing up"→"Vomiting", "tired"→"Fatigue"
- Include ALL symptoms mentioned, not just the first one
- Example: "I have headache, fever and I feel tired" → ["Headache","Fever","Fatigue"]
Return ONLY the JSON array, no other text.`,

  // Step 3 — detail for one symptom
  step3detail: `You are a medical intake assistant. The patient described details about a specific symptom.
Return ONLY a valid JSON object:
{"duration":string,"severity":number,"onset":"sudden"|"gradual"}
Rules:
- duration: "3 days", "2 weeks", "a month", "unknown" if not stated
- severity 1-10: "terrible"/"unbearable"→9, "very bad"→8, "bad"→7, "moderate"→5, "mild"→3, "slight"→2
- onset: "suddenly"/"out of nowhere"/"abrupt" → "sudden"; anything else → "gradual"
Return ONLY the JSON object, no other text`,
};

// ── POST /api/voice/parse ───────────────────────────────────────────────────
// Body: { step, text, context?, symptomName? }
//   context     — the question that was asked (helps LLM know which field to fill)
//   symptomName — for step3detail only
// Returns: { parsed: object|array }
router.post('/parse', verifyToken, async (req, res) => {
  const { step, text, context, symptomName } = req.body;

  if (!step || !text) {
    return res.status(400).json({ error: 'step and text are required' });
  }
  if (!PARSE_PROMPTS[step]) {
    return res.status(400).json({ error: `Unknown step: ${step}` });
  }

  let systemPrompt = PARSE_PROMPTS[step];
  let userContent  = text;

  // Include the question asked so the LLM knows which field to target
  if (context) {
    userContent = `Question asked: "${context}"\nPatient answered: "${text}"`;
  }
  if (step === 'step3detail' && symptomName) {
    userContent = `Symptom: ${symptomName}\nPatient said: "${text}"`;
  }

  try {
    const raw = await callWithFallback([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent },
    ]);

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[voice/parse] LLM returned non-JSON:', raw);
      return res.status(422).json({ error: 'Could not parse response', raw });
    }

    res.json({ parsed });
  } catch (err) {
    console.error('[voice/parse] AI error:', err.message);
    res.status(500).json({ error: 'AI parse failed', details: err.message });
  }
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

  const abnormalText = abnormal.length > 0
    ? abnormal.slice(0, 6).map(f =>
        `${f.parameter}: ${f.your_value} (normal: ${f.normal_range}) — ${f.status}`
      ).join('; ')
    : 'All values within normal range.';

  const scriptPrompt = `You are a warm, empathetic doctor speaking directly to a patient after reviewing their blood test results. Write a clear, calm 2-minute spoken narration (about 200-250 words) that:
- Starts with a brief friendly greeting
- Summarizes the overall picture in plain English
- Mentions the 2-3 most important findings and what they mean for daily life
- Gives one or two simple lifestyle tips based on the results
- Ends with encouragement and a reminder to consult their doctor for any concerns

Do NOT use medical jargon. Do NOT say "your analysis shows" — speak naturally as if talking to the patient in person.
Do NOT include any JSON, bullet points, or formatting — just natural spoken sentences.

Report data:
Overall: ${summary.overall_assessment || 'Analysis complete.'}
Root cause: ${summary.root_cause || 'Not identified.'}
Complexity: ${summary.complexity || 'Moderate'}
Key abnormal findings: ${abnormalText}`;

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


// ─── POST /api/voice/explain-finding ───────────────────────────────────────
// Returns a plain-English explanation of a single abnormal blood finding.
// Returns: { explanation: string }
router.post('/explain-finding', verifyToken, async (req, res) => {
  const { parameter, your_value, normal_range, status } = req.body;
  if (!parameter) return res.status(400).json({ error: 'parameter is required' });

  const prompt = `A patient's blood test shows: ${parameter} = ${your_value} (normal range: ${normal_range || 'not specified'}, status: ${status || 'abnormal'}).

Write a 2-3 sentence plain-English explanation for the patient (no medical jargon) that covers:
1. What this parameter does in the body
2. What it means that it is ${status || 'abnormal'}
3. One practical implication for daily life

Be warm, clear, and reassuring. Do not recommend specific treatments or drugs.`;

  const providers = getProviders();
  const available = getAvailableProviders();

  let explanation = null;
  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: 'You explain blood test results in plain English to patients. Be concise (2-3 sentences), warm, and avoid jargon.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 150,
      });
      explanation = response.choices[0]?.message?.content?.trim();
      if (explanation) break;
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 429 || status === 503) continue;
      throw err;
    }
  }

  if (!explanation) {
    return res.status(503).json({ error: 'Could not generate explanation. Try again.' });
  }

  return res.json({ explanation });
});

module.exports = router;
