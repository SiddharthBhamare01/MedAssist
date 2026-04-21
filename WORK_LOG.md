# WORK LOG — MedAssist AI CS 595

> Auto-saved thinking log. Each session appended below.
> Purpose: resume without re-reading all code — just read this.

---

## Session: 2026-04-14 — ElevenLabs Voice Integration

### Goal
Add a Voice Mode to the Patient Intake wizard (Intake.jsx) so patients can go through the
3-step form completely by speaking, instead of clicking/typing.

### Current State (before this session)
- Days 1–12 complete (see MEMORY.md for full list)
- `client/src/pages/Patient/Intake.jsx` — 3-step wizard:
  - Step 1: Basic Info (age, gender, weight, height, blood group)
  - Step 2: Medical History (conditions, allergies, medications, smoking, alcohol)
  - Step 3: Symptoms (36 symptoms across 7 systems, each with duration/severity/onset)
- AI stack: Groq (llama-3.3-70b-versatile) via `GROQ_API_KEY` in `.env`
- NO ElevenLabs key in .env yet — will add placeholder `ELEVENLABS_API_KEY`

### Architecture Decision
3-layer approach:
1. **ElevenLabs TTS** (server-proxied) → speaks questions to patient (clear AI voice)
2. **Browser Web Speech API** (SpeechRecognition) → captures patient's spoken answer (free, no API)
3. **Groq LLM** (existing key) → parses raw spoken text into structured form JSON

Rationale: Keep ElevenLabs key server-side (security). Groq parsing avoids building brittle
regex parsers. Web Speech API is free and built into Chrome/Edge.

### Files to Create/Modify

**Backend (new):**
- `server/routes/voice.js`
  - POST `/api/voice/speak` — proxies ElevenLabs TTS, streams audio back
  - POST `/api/voice/parse` — Groq call to parse spoken text → structured JSON

**Backend (modify):**
- `server/index.js` — register `/api/voice` route

**Frontend (new):**
- `client/src/hooks/useVoice.js` — encapsulates TTS playback + SpeechRecognition logic
- `client/src/components/VoiceIntake.jsx` — the floating voice assistant UI component

**Frontend (modify):**
- `client/src/pages/Patient/Intake.jsx` — add "Voice Mode" toggle, wire VoiceIntake

**Config:**
- `server/.env` — add `ELEVENLABS_API_KEY=` (user must fill)

### Conversation Script (per step)

**Step 1 — Basic Info:**
Q1: "Please tell me your age."
Q2: "What is your gender? Say male, female, or other."
Q3: "What is your weight in kilograms? You can skip this."
Q4: "What is your height in centimeters? You can skip this."
Q5: "What is your blood group? For example: A positive, B negative, O positive."

**Step 2 — Medical History:**
Q1: "Do you have any existing medical conditions? For example: diabetes, hypertension, asthma, heart disease. Say none if not applicable."
Q2: "Do you have any allergies? For example: penicillin, pollen. Say none if not."
Q3: "Are you currently taking any medications? Say none if not."
Q4: "What is your smoking status? Say never, former, or current."
Q5: "What is your alcohol use? Say none, occasional, or regular."

**Step 3 — Symptoms:**
Q1: "Please describe all the symptoms you are experiencing right now. You can list multiple symptoms."
Q2 (per symptom): "For [SYMPTOM], how many days have you had it, how severe is it on a scale of 1 to 10, and did it come on suddenly or gradually?"

### Groq Parsing Prompts

**Step 1 parser system prompt:**
Extract: { age(number), gender(male/female/other/prefer-not-to-say), weightKg(number|null), heightCm(number|null), bloodGroup(A+/A-/B+/B-/AB+/AB-/O+/O-|null) }

**Step 2 parser system prompt:**
Extract: { existingConditions(array), allergies(array), currentMedications(array), smokingStatus(never/former/current|null), alcoholUse(none/occasional/regular|null) }

**Step 3 parser system prompt:**
Extract: { symptoms: [{ name(string matching known list), duration(string), severity(1-10), onset(sudden/gradual) }] }

### ElevenLabs API Details
- Endpoint: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
- Voice: Rachel — voice_id = `21m00Tcm4TlvDq8ikWAM` (calm, professional, medical-appropriate)
- Request body: { text, model_id: "eleven_turbo_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }
- Response: audio/mpeg binary stream
- Auth header: `xi-api-key: <ELEVENLABS_API_KEY>`
- Server proxies this → client plays via AudioContext / <audio> element

### Implementation Order — COMPLETED ✅
1. [x] Write WORK_LOG.md (this file)
2. [x] Add ELEVENLABS_API_KEY placeholder to server/.env
3. [x] Create server/routes/voice.js (TTS proxy + Groq parse, 5 step parsers)
4. [x] Register /api/voice route in server/index.js
5. [x] Create client/src/hooks/useVoice.js (speak/listen/stopSpeaking/stopListening)
6. [x] Create client/src/components/VoiceIntake.jsx (full 3-step voice runner)
7. [x] Modify client/src/pages/Patient/Intake.jsx (voiceMode toggle + VoiceIntake mount)

### IMPORTANT — What user must do to activate ElevenLabs TTS
1. Get API key: elevenlabs.io → Profile → API Keys → Create
2. Open `medassist/server/.env`
3. Replace `your_elevenlabs_api_key_here` with actual key
4. Restart server

### Fallback behavior (no ElevenLabs key)
- TTS silently fails — UI shows question text in card so user can still read
- STT (browser) + Groq parsing both still work — voice capture + auto-fill works
- Voice mode remains fully functional for capturing answers, just no audio questions

### Files Changed
- CREATED: `server/routes/voice.js`
- MODIFIED: `server/index.js`
- MODIFIED: `server/.env`
- CREATED: `client/src/hooks/useVoice.js`
- CREATED: `client/src/components/VoiceIntake.jsx`
- MODIFIED: `client/src/pages/Patient/Intake.jsx`

### Key Implementation Notes
- SpeechRecognition: `window.SpeechRecognition || window.webkitSpeechRecognition` (Chrome/Edge)
- TTS audio: server proxies ElevenLabs → client receives ArrayBuffer → AudioContext plays
- 5 Groq parse modes: step1, step2, step3symptoms, step3detail
- Auto-advance: after last Q of each step, calls onStep1Done/onStep2Done/onStep3Done
- Floating mic button bottom-right: click to start/stop voice session
- Voice mode toggle button shown below wizard card when not active

### Progress Log
- 14:00 — Started session, read all relevant files
- 14:05 — Wrote WORK_LOG.md architecture plan
- 14:20 — Implemented backend: voice.js, index.js, .env
- 14:30 — Implemented useVoice.js hook
- 14:40 — Implemented VoiceIntake.jsx
- 14:50 — Integrated into Intake.jsx
- 14:55 — Fixed: removed unused imports, dead dynamic import bug in runStep1

---

## Session: 2026-04-14 (continued) — Voice Fixes & Enhancements

### Changes Made This Session

#### 1. Custom ElevenLabs Voice ID
- User generated custom medical assistant voice via ElevenLabs Voice Lab
- Voice ID: `W1TKxm4MpGXSlpN7iVQy`
- Updated `server/routes/voice.js` line 13: `ELEVENLABS_VOICE_ID = 'W1TKxm4MpGXSlpN7iVQy'`
- User also added `ELEVENLABS_API_KEY=sk_12b6d...` to `server/.env`

#### 2. Fixed AudioContext Autoplay Block (no audio issue)
- **Root cause**: Browser blocks AudioContext created inside async chain (not a direct click handler)
- **Fix**: Added `initAudio()` to `useVoice.js` — must be called synchronously on click
- In `VoiceIntake.jsx` mic button onClick: `initAudio()` called BEFORE `startVoice()`
- File: `client/src/hooks/useVoice.js` — added `initAudio` function + exported it
- File: `client/src/components/VoiceIntake.jsx` — destructure `initAudio`, call on button click

#### 3. Fixed 429 Rate Limiting on Parse (callWithFallback)
- **Root cause**: `voice.js` used `getPrimaryProvider()` which picks ONE provider. When Cerebras 429s, it crashes.
- **Fix**: Replaced with `callWithFallback()` that cycles Cerebras → SambaNova → OpenRouter → GitHub
- File: `server/routes/voice.js` — added `callWithFallback()`, removed `getAI()` singleton
- Import changed: `getPrimaryProvider` → `getProviders, getAvailableProviders`
- Added error toast in `useVoice.js` for TTS failures (was silently swallowed before)

#### 4. Fixed Multiple-Entry Parsing (allergies, conditions, medications)
- **Root cause**: One big `step2` prompt for all 5 fields confused the LLM → only 1 item extracted
- **Fix**: 5 dedicated parse prompts, one per question
  - `conditions` — extracts array matching known conditions list
  - `allergies` — extracts every allergen into array
  - `medications` — extracts every medication into array
  - `smoking` — returns single word: never/former/current
  - `alcohol` — returns single word: none/occasional/regular
- File: `server/routes/voice.js` — replaced `step2` with 5 field-specific prompts
- File: `client/src/components/VoiceIntake.jsx` — STEP2_QUESTIONS now has `parseStep` per question
- `runStep2` sends `step: parseStep` instead of `step: 'step2'`

#### 5. Fixed Auto-Continue Between Steps (no re-press needed)
- **Root cause**: `startVoice` ran only `if (step === 1)` then stopped. User had to re-press mic for step 2 and 3.
- **Fix**: `startVoice` now runs all remaining steps in sequence from current step
  ```js
  if (step <= 1) { await runStep1(); if (cancelRef.current) return; }
  if (step <= 2) { await runStep2(); if (cancelRef.current) return; }
  await runStep3();
  ```
- File: `client/src/components/VoiceIntake.jsx` — updated `startVoice` logic

#### 6. Real-Time Visual Field Fill (VoiceBadge)
- **What**: As each answer is captured, the form field fills in AND a green `✓ value` badge appears on the label
- **How**:
  - Added `VoiceBadge` component in `Intake.jsx` (green pill with checkmark + value)
  - Added `voiceLiveData: { step1: {}, step2: {} }` state in `Intake.jsx`
  - Added `handleVoiceLive(stepKey, field, value)` callback
  - `VoiceIntake` accepts `onLiveUpdate` prop → called after each field parsed
  - `Step1` accepts `voiceLive` prop → `useEffect` calls `setValue()` for each filled field
  - `Step2` accepts `voiceLive` prop → `useEffect` fills TagInputs + react-hook-form fields
  - TagInput `label` prop updated to accept JSX (for embedding VoiceBadge)
- Files: `Intake.jsx` (Step1, Step2, Step3, main component), `VoiceIntake.jsx`

#### 7. Fixed Weight & Height Auto-Fill
- **Root cause**: step1 parser got only "75" with no context about which question was asked. LLM guessed wrong field (put weight in age).
- **Fix**: Every parse request now sends `context: q` (the question text)
  - Backend builds: `Question asked: "What is your weight?" \n Patient answered: "75 kilos"`
  - LLM now knows exactly which field to fill
- File: `server/routes/voice.js` — `/parse` endpoint now accepts `context` param
- File: `client/src/components/VoiceIntake.jsx` — `runStep1`, `runStep2` pass `context: q`

#### 8. Retry Logic (3 attempts → close with hint)
- Every question goes through `askWithRetry()` instead of `askAndListen()` directly
- Attempt 1: original question
- Attempt 2: "Sorry, I didn't catch that. [question]"
- Attempt 3: "One last try — please speak clearly. [question]"
- After 3 failures: `closeWithHint()` speaks closing message → closes voice window automatically
- Closing message tells patient what to do: "Please try voice mode again, or fill in the form manually."
- UI shows orange "Attempt X of 3" badge during retries
- Files: `client/src/components/VoiceIntake.jsx` — added `askWithRetry`, `closeWithHint`, `retryAttempt` state

### Current State of Voice Feature (fully working)
- ElevenLabs TTS: custom voice W1TKxm4MpGXSlpN7iVQy speaks all questions
- Browser SpeechRecognition: captures patient answers
- Groq (via callWithFallback): parses spoken text → structured JSON
- Form auto-fills in real time as each question is answered
- Green ✓ badge on each label shows captured value instantly
- 3-attempt retry per question, then graceful close with instructions
- Runs all 3 steps in one press (no re-press between steps)

### Files Changed (cumulative this session)
| File | Type | What changed |
|---|---|---|
| `server/routes/voice.js` | Modified | callWithFallback, 6 parse prompts, context param |
| `server/index.js` | Modified | /api/voice route |
| `server/.env` | Modified | ELEVENLABS_API_KEY + voice ID |
| `client/src/hooks/useVoice.js` | Modified | initAudio(), error toast, initAudio export |
| `client/src/components/VoiceIntake.jsx` | Modified | askWithRetry, closeWithHint, onLiveUpdate, auto-continue, retryAttempt UI |
| `client/src/pages/Patient/Intake.jsx` | Modified | VoiceBadge, voiceLiveData, handleVoiceLive, Step1/Step2 voiceLive props |

### Free AI Providers Added to Project (recommendations given)
Recommended adding to `aiClients.js` + `.env`:
- **Groq**: `GROQ_API_KEY` → `https://api.groq.com/openai/v1` → `llama-3.3-70b-versatile` (fastest free, no monthly cap)
- **Together AI**: `TOGETHER_API_KEY` → `https://api.together.xyz/v1` → `meta-llama/Llama-3.3-70B-Instruct-Turbo` ($25 free)
- **Mistral AI**: `MISTRAL_API_KEY` → `https://api.mistral.ai/v1` → `mistral-small-latest` (free tier)
- Add to `PRIORITY_ORDER`: `['groq', 'cerebras', 'cerebras_fast', 'together', 'sambanova', 'mistral', 'openrouter', 'github']`

### Next Steps (remaining)
- [ ] Day 13: E2E integration testing (including voice flow)
- [ ] Day 14: Documentation
- [ ] Day 15: Demo prep + submission
- Voice feature is demo-ready as-is

---

## Session: 2026-04-15 — Entrance Animations + VoiceIntake UI Redesign

### Goal
Two issues to fix:
1. `Profile.jsx` and `Doctors.jsx` pages were missing the `framer-motion` entrance animation present in Vitals, Prescriptions, and Sessions pages
2. VoiceIntake UI was too "widget-like" — not patient-friendly. Needed a redesign that communicates the purpose of assisting the patient clearly

### Root Cause Analysis

**Animation gap**: Vitals and Prescriptions wrap their root `<div>` with `<motion.div variants={fadeIn} initial="hidden" animate="visible">`. Profile and Doctors did not — they used plain `<div>`. The pattern is consistent across all other patient pages and just needed to be applied.

**VoiceIntake UI problem**: The old design was a floating card with a gradient blue header and a raw mic button. It felt like a browser extension widget, not a medical AI assistant. No visual distinction between the AI speaking vs patient speaking, dots and status badges were scattered.

### Approach

**Animations**:
- Added `import { motion } from 'framer-motion'` + `const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: {...} }` to both `Profile.jsx` and `Doctors.jsx`
- Wrapped outer root element with `<motion.div variants={fadeIn} initial="hidden" animate="visible">` in both files

**VoiceIntake redesign**:
- Replaced floating gradient widget with a structured 340px medical assistant card
- **Chat-bubble layout**: AI questions appear as left-aligned "MedAssist" bubbles; patient's heard text appears as right-aligned "You said" bubbles — mirrors natural conversation
- **Step progress tabs**: 3 tabs at the top (Basic Info / Medical History / Symptoms) with active/done/pending states
- **Status area**: animated waveform bars when listening; bouncing ThinkingDots when processing; pulse ring on avatar when speaking
- **Idle state**: just shows a clean teal mic button (no card) to avoid clutter — card appears only when active
- **Footer hint**: context-aware text ("Speak now — I'm listening" vs "Please wait…") inside the panel
- **Stop button**: red circular button at bottom right during active session (instead of inline cancel link)
- Removed emoji from header — replaced with SVG icons (sparkle = AI, circle = patient)
- Collected data chips still present but in a cleaner "Captured so far" section

### Files Changed
| File | Change |
|---|---|
| `client/src/pages/Patient/Profile.jsx` | Added framer-motion fadeIn entrance animation |
| `client/src/pages/Patient/Doctors.jsx` | Added framer-motion fadeIn entrance animation |
| `client/src/components/VoiceIntake.jsx` | Full UI redesign — chat-bubble layout, step tabs, waveform, SVG icons |
