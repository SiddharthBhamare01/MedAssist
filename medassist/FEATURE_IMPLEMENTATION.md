# Implementation Guide: Voice Narration + Explain This Buttons
## MedAssist AI — Analysis Report Page

---

## What We Are Building

### Feature 1 — "Listen to Your Report" Voice Narration
A **▶ Listen to Report** button in the Analysis page header. When clicked:
1. Calls a new backend route that fetches the patient's analysis from DB
2. Uses the LLM ensemble to write a doctor-style narration script (~200-250 words)
3. Sends the script to ElevenLabs TTS (already configured in .env)
4. Returns audio that plays inline on the page
5. Shows a "Stop" button while playing

### Feature 2 — "Explain This" Buttons on Abnormal Findings
A small **?** button on each row of the Abnormal Findings table. When clicked:
1. Calls a new backend route with that finding's data
2. LLM explains it in 2-3 sentences of plain English (no jargon)
3. Shows explanation in a small modal

---

## Existing Infrastructure to Reuse (no new keys/packages needed)

| What | Where | Notes |
|------|-------|-------|
| ElevenLabs TTS logic | `server/routes/voice.js` → `POST /api/voice/speak` | Copy the fetch block |
| LLM ensemble | `server/utils/aiClients.js` → `getProviders()`, `getAvailableProviders()` | Already handles fallback |
| Auth middleware | `server/middleware/auth.js` → `verifyToken` | Used on all protected routes |
| ElevenLabs voice ID | `W1TKxm4MpGXSlpN7iVQy` | Already in voice.js |
| ElevenLabs model | `eleven_turbo_v2` | Already in voice.js |
| DB pool | `server/db/pool.js` | Already used everywhere |

---

## File Changes Summary

| File | Change |
|------|--------|
| `server/routes/voice.js` | Add 2 new routes at the bottom (before `module.exports`) |
| `client/src/pages/Patient/Analysis.jsx` | Add state, handlers, Listen button, ? buttons, modal |

**No new files. No new npm packages. No new API keys.**

---

## PART 1 — Backend: `server/routes/voice.js`

Add these two routes at the **bottom of the file**, before `module.exports = router;`

```javascript
// ─── POST /api/voice/narrate-report ────────────────────────────────────────
// Generates a doctor-style audio narration of the patient's blood report.
// Returns: audio/mpeg buffer
router.post('/narrate-report', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  const pool = require('../db/pool');

  // 1. Fetch analysis from DB
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

  // 2. Build narration script prompt
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

  // 3. Generate script with LLM ensemble (auto-fallback across providers)
  const { getProviders, getAvailableProviders } = require('../utils/aiClients');
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
      if (err.status === 429 || err.status === 503) continue;
      throw err;
    }
  }

  if (!script) {
    return res.status(503).json({ error: 'Could not generate narration script. Try again.' });
  }

  // 4. Send script to ElevenLabs TTS
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const VOICE_ID = 'W1TKxm4MpGXSlpN7iVQy';

  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'TTS not configured' });
  }

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: script,
          model_id: 'eleven_turbo_v2',
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

  const { getProviders, getAvailableProviders } = require('../utils/aiClients');
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
      if (err.status === 429 || err.status === 503) continue;
      throw err;
    }
  }

  if (!explanation) {
    return res.status(503).json({ error: 'Could not generate explanation. Try again.' });
  }

  return res.json({ explanation });
});
```

---

## PART 2 — Frontend: `client/src/pages/Patient/Analysis.jsx`

### Step A — Update the React import (line 1)

Change:
```javascript
import { useState, useEffect } from 'react';
```
To:
```javascript
import { useState, useEffect, useRef } from 'react';
```

---

### Step B — Add new state variables

Find `const [exporting, setExporting] = useState(false);` and add these lines right after it:

```javascript
// Voice narration state
const [isNarrating, setIsNarrating] = useState(false);
const [isLoadingNarration, setIsLoadingNarration] = useState(false);
const audioRef = useRef(null);

// Explain This modal state
const [explainModal, setExplainModal] = useState({ open: false, loading: false, text: '', parameter: '' });
```

---

### Step C — Add the narration handler

Add this function after `handleExportPDF`:

```javascript
const handleNarrate = async () => {
  // If already playing, stop
  if (isNarrating) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsNarrating(false);
    return;
  }

  setIsLoadingNarration(true);
  try {
    const response = await api.post(
      '/voice/narrate-report',
      { reportId },
      { responseType: 'arraybuffer' }
    );
    const blob = new Blob([response.data], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      setIsNarrating(false);
      URL.revokeObjectURL(url);
    };
    audio.play();
    setIsNarrating(true);
  } catch (err) {
    toast.error('Could not generate narration. Try again.');
  } finally {
    setIsLoadingNarration(false);
  }
};
```

---

### Step D — Add the explain handler

Add this function right after `handleNarrate`:

```javascript
const handleExplainFinding = async (finding) => {
  setExplainModal({ open: true, loading: true, text: '', parameter: finding.parameter });
  try {
    const { data } = await api.post('/voice/explain-finding', {
      parameter: finding.parameter,
      your_value: finding.your_value,
      normal_range: finding.normal_range,
      status: finding.status,
      interpretation: finding.interpretation,
    });
    setExplainModal((m) => ({ ...m, loading: false, text: data.explanation }));
  } catch {
    setExplainModal((m) => ({ ...m, loading: false, text: 'Could not load explanation. Please try again.' }));
  }
};
```

---

### Step E — Add the Listen button in the header

Find this block (the Export PDF / Share buttons):
```jsx
{!loading && result && (
  <div className="flex items-center gap-2 flex-wrap">
    <button
      onClick={handleExportPDF}
```

Add the **Listen to Report** button as the FIRST button inside that `flex` div:

```jsx
<button
  onClick={handleNarrate}
  disabled={isLoadingNarration}
  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
>
  {isLoadingNarration ? (
    <>
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Preparing...
    </>
  ) : isNarrating ? (
    <>
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
      </svg>
      Stop
    </>
  ) : (
    <>
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z"/>
      </svg>
      Listen to Report
    </>
  )}
</button>
```

---

### Step F — Add ? buttons to the Abnormal Findings table

**In `<thead>`**, find the last `<th>` (Interpretation) and add one more after it:
```jsx
<th className="py-1.5 px-1.5 font-medium w-8"></th>
```

**In `<tbody>`**, each `<tr>` ends with the interpretation `<td>`. Add one more `<td>` after it:
```jsx
<td className="py-1.5 px-1.5">
  <button
    onClick={() => handleExplainFinding(f)}
    className="w-6 h-6 rounded-full bg-teal-50 hover:bg-teal-100 text-teal-600 text-xs font-bold flex items-center justify-center transition-colors"
    title="Explain in plain English"
  >
    ?
  </button>
</td>
```

---

### Step G — Add the Explain Modal

Find `{showShareModal && (` and add the explain modal block **right after** the ShareModal closing tag:

```jsx
{/* Explain This Modal */}
{explainModal.open && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    onClick={() => setExplainModal({ open: false, loading: false, text: '', parameter: '' })}
  >
    <div
      className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-800">{explainModal.parameter}</h3>
          <p className="text-xs text-teal-600 mt-0.5">Plain English Explanation</p>
        </div>
        <button
          onClick={() => setExplainModal({ open: false, loading: false, text: '', parameter: '' })}
          className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 shrink-0"
        >
          ✕
        </button>
      </div>

      {explainModal.loading ? (
        <div className="flex items-center gap-3 py-4">
          <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-sm text-slate-500">Getting explanation...</p>
        </div>
      ) : (
        <p className="text-slate-700 leading-relaxed">{explainModal.text}</p>
      )}

      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          AI-generated — always consult your doctor for medical advice.
        </p>
      </div>
    </div>
  </div>
)}
```

---

## Verification Checklist

After implementing, test the following:

**Voice Narration:**
- [ ] Open any analyzed blood report page
- [ ] "Listen to Report" button appears in the header (purple/violet color)
- [ ] Click it → shows "Preparing..." spinner for ~3–5 seconds
- [ ] Audio plays — warm doctor-style narration of the specific report
- [ ] Click "Stop" → audio stops immediately
- [ ] Button returns to "Listen to Report" state

**Explain This:**
- [ ] Abnormal Findings table has a `?` button on every row
- [ ] Click `?` → modal opens immediately with spinner
- [ ] After ~1–2 seconds, plain-English explanation appears
- [ ] Clicking ✕ or outside the modal closes it
- [ ] Works on multiple rows in sequence

**Error handling:**
- [ ] If ElevenLabs quota exceeded → toast "Could not generate narration. Try again."
- [ ] If all LLM providers are rate-limited → modal shows "Could not load explanation. Please try again."

---

## Commit Message

```
feat: add voice narration and explain-this to analysis page

- POST /api/voice/narrate-report: LLM generates doctor-style script,
  ElevenLabs reads it aloud, returns audio/mpeg buffer
- POST /api/voice/explain-finding: explains any abnormal blood value
  in 2-3 sentences of plain English
- Analysis.jsx: Listen to Report button (violet, play/stop toggle),
  question-mark button on each abnormal finding row, explain modal
```

---

## Key Notes for Next Claude Session

- The `api` axios instance (imported from `../../services/api`) auto-attaches the Bearer token — no auth changes needed in the frontend
- `api.post('/voice/narrate-report', data, { responseType: 'arraybuffer' })` is essential — without `arraybuffer`, the audio data will be corrupted
- The two new routes go in `server/routes/voice.js` — this file is already registered in `server/index.js`, no registration change needed
- `useVoice.js` hook is intentionally NOT used — calling the API directly is simpler and avoids AudioContext complexity for this use case
- Both routes use the same multi-provider LLM fallback pattern as all other agents in the project
