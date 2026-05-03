# MedAssist AI

**AI-powered medical assistant that transforms raw blood reports into clear, actionable health guidance — with voice, chat, bilingual support, and automated follow-up.**

![Stack](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Stack](https://img.shields.io/badge/Express-4-000000?logo=express)
![Stack](https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?logo=supabase)
![Stack](https://img.shields.io/badge/AI-Multi--Agent_Ensemble-8B5CF6)
![Stack](https://img.shields.io/badge/Course-CS_595_Medical_Informatics-blue)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [How MedAssist Solves It](#2-how-medassist-solves-it)
3. [Core Features](#3-core-features)
4. [Application Flow](#4-application-flow)
5. [High-Level Design (HLD)](#5-high-level-design-hld)
6. [Multi-Agent Ensemble Architecture](#6-multi-agent-ensemble-architecture)
7. [Security Model](#7-security-model)
8. [Follow-up Reminder System](#8-follow-up-reminder-system)
9. [Tech Stack](#9-tech-stack)
10. [Project Setup](#10-project-setup)

---

## 1. Problem Statement

### Blood Report Literacy Gap

Patients who receive blood reports often lack the medical knowledge to interpret their results and must schedule a doctor's appointment solely for report analysis — adding cost, time, and unnecessary friction to their healthcare journey.

A typical CBC or lipid panel returns 20–40 parameters with numeric values, reference ranges, and medical abbreviations that are opaque to the average patient. The result: patients either ignore reports until something critical is missed, or over-schedule appointments that a brief AI-assisted interpretation could have resolved.

### Lack of Actionable Follow-up

Even when a report flags an abnormality, patients are rarely told *when* to recheck, *what* to recheck, or *why* rechecking matters. Without structured follow-up, chronic conditions go unmonitored and early interventions are missed.

### No Patient Engagement After Diagnosis

Once a patient receives their report, there is no mechanism to ask follow-up questions, hear the findings explained in simple terms, or track their health progress over time. The experience is a one-time event rather than an ongoing health journey.

### Language Barrier and Accessibility

Spanish-speaking patients cannot fully benefit from English-only medical reports. Paper reports are also difficult to share with family or caregivers, and there is no unified way to track how parameters change across multiple visits.

---

## 2. How MedAssist Solves It

| Problem | MedAssist Solution |
|---|---|
| Uninterpretable blood reports | Multi-phase AI analysis: plain-English summary, abnormal findings, diet plan, recovery guidance |
| No follow-up guidance | Automated follow-up recommendations + email reminders sent 3 days before recheck date |
| No way to ask questions | Per-report AI chatbot — type or speak your question, get a contextual doctor-style answer |
| Report not accessible | Bilingual support (English + Spanish), voice narration, shareable links, PDF export |
| No health trend visibility | Full report history with trend charts and side-by-side report comparison to track improvements or changes across visits |
| Uploading PDFs is inconvenient | Camera mode: take a photo of the report directly in the app — no conversion needed |
| Single-model AI unreliability | Ensemble of 2 parallel AI providers + a consensus judge to increase accuracy and safety |

---

## 3. Core Features

### Primary Features

#### Blood Report Upload and Analysis *(Main Feature)*

- **Two input modes**: drag-drop a PDF or image file, OR capture a photo directly using the device camera (rear-facing, portrait guide frame overlay — no file conversion needed)
- OCR (Gemini Vision) extracts every parameter with value, unit, and status immediately on upload
- AI analysis runs in multiple phases after the patient clicks "Analyze":
  - **Phase 1** — Agent calls lab reference range tools for the most abnormal parameters
  - **Phase 2a (Medical)** — Overall assessment, root cause, complexity rating, doctor referral recommendation, all in plain English
  - **Phase 2b (Lifestyle)** — Personalized diet plan (foods to eat/avoid, full daily meal schedule) and recovery ingredients with usage guidance
- Composite clinical risk score 0–100 computed across four validated frameworks: Framingham (cardiovascular), FINDRISC (diabetes), CKD-EPI (kidney), Child-Pugh (liver)
- Individual parameter explanation: click "Explain This" on any abnormal finding for a 2–3 sentence plain-English explanation of what that value means for the patient personally
- Auto-generated medication log entries from tablet recommendations in the analysis

#### Per-Report AI Chatbot

Every analyzed report has a floating AI chatbot tied specifically to that report's data. The chatbot persona is "Dr. MedAssist" — a warm, experienced family doctor speaking to the patient as if in a real consultation.

**Text input**: Type any question about the report. The AI cites the patient's actual values (e.g., "Your hemoglobin came back at 10.2, which is below the normal 12–16 range...") rather than giving generic advice.

**Voice input**: Tap the microphone button and speak — Web Speech Recognition transcribes the question and sends it automatically. Supports both English and Spanish voice recognition.

**Voice output (auto-speak)**: AI replies are spoken aloud automatically (toggle on/off). English uses ElevenLabs TTS; Spanish uses the browser's native SpeechSynthesis with an `es-ES` voice. Each individual message also has a play/stop button.

**Multilingual**: The chatbot responds in the patient's currently selected language — the same `lang` setting used by the rest of the app.

**Session history**: The last 10 messages are included in each request, so the AI maintains context across a conversation.

**Quick-reply suggestions**: Four pre-written question chips appear on first open so patients can get started without typing.

#### Doctor-Style Voice Narration of Report

A dedicated "Hear Report" feature generates a warm, empathetic 2-minute spoken narration of the full analysis — structured like a real doctor's consultation:
1. Greeting and report overview
2. Diagnosis and root cause (spoken first, most important)
3. Walk-through of each abnormal value in plain language
4. Practical lifestyle suggestions
5. Closing encouragement and follow-up reminder

The narration script is generated by AI, then converted to natural speech by ElevenLabs TTS. This gives patients a personal-touch experience without requiring them to read through the full analysis text.

#### Bilingual Support (English + Spanish)

The entire application is available in English and Spanish, switchable at any time via the language toggle in the navbar.

- **UI strings**: every label, button, tooltip, and navigation item is translated via `i18next` / `react-i18next`
- **AI-generated content**: the full analysis (summary, abnormal findings, diet plan, recovery ingredients, follow-up) is translated to Spanish via a batched AI translation endpoint; results are cached in the database so re-loading the Spanish view does not re-translate
- **Chatbot**: responds in the patient's active language — Spanish replies use a Spanish doctor persona, English replies use ElevenLabs TTS; both support voice input via the Web Speech API
- **Individual explanations**: the "Explain This" feature also returns Spanish when the app is in Spanish mode

#### Report Comparison

Patients can select any two of their analyzed reports and compare them side-by-side:
- Each parameter shown with values from both reports, normal reference range, and status badges (normal / high / low)
- Delta display: upward/downward arrow with the percentage change between reports
- Trend label per parameter: "Worsened", "Improved", or "Stable"
- Visual **RangeBar**: a horizontal track showing the normal range with two dot markers — one for each report — so patients can see exactly where their values sit and how they shifted

#### Report History and Trend Tracking

- All uploaded and analyzed reports listed chronologically on the Report History page
- Composite health score (0–100) plotted as a sparkline across the last 10 reports
- Per-report summary: total parameters, abnormal count, analyzed status
- Select any two reports to launch the comparison view

### Supporting Features

| Feature | Description |
|---|---|
| Follow-up recommendations | AI recommends recheck timing for every abnormal finding with priority (urgent / routine / monitoring) |
| Automated email reminders | Email sent 3 days before the recommended recheck date (see §8) |
| Vital sign tracking | Manual entry of glucose, blood pressure, heart rate, weight, SpO2, temperature with 30-day trend charts |
| Vital insights | LLM-generated correlation between daily vitals and the latest blood test findings (2-hour cache) |
| Supplement tracker | Daily supplement log with a 30-day consecutive-day streak counter |
| Health engagement badges | First Report, On Track, Improving, Follow-up Champion — awarded automatically |
| Daily health tips | 3 AI-generated personalized tips per day based on the latest report findings (24-hour cache) |
| 48-hour shareable report link | Read-only token-gated URL to share analysis with a doctor or family member; expires automatically |
| PDF export | Summary Card (1 page, patient-friendly) and Full Report (comprehensive, clinical detail) |
| Patient profile | Demographics, blood group, existing conditions, allergies, medications, smoking/alcohol status |
| Medication auto-log | Tablet recommendations from blood analysis are automatically added to the medication log |
| Admin dashboard | Platform statistics, user management, 30-day registration trend chart, paginated audit trail |

---

## 4. Application Flow

```
User                           Client                         Server                          AI Layer
 │                                │                               │                               │
 ├─ Register / Login ───────────► │                               │                               │
 │◄─ JWT token ──────────────────┤◄─ POST /auth/login ───────────┤                               │
 │                                │                               │                               │
 ├─ Upload report ──────────────► │                               │                               │
 │  (drag-drop PDF/image          │                               │                               │
 │   OR take photo via camera)    │                               │                               │
 │                                ├─ POST /blood-report/upload ──►│                               │
 │                                │                               ├─ Gemini Vision OCR ──────────►│
 │                                │◄─ { reportId, extractedValues}┤◄─ Extracted parameters ───────┤
 │◄─ Preview: all parameters ────┤                               │                               │
 │   with values + status badges  │                               │                               │
 │                                │                               │                               │
 ├─ Click "Analyze" ────────────► │                               │                               │
 │                                ├─ POST /blood-report/analyze ─►│                               │
 │◄─ { status: "processing" } ───┤◄─ immediate response ─────────┤                               │
 │                                │                               │                               │
 │  (client polls GET /:id        │                               ├─ Phase 1: Tool calls ─────────►│
 │   every 5s until analyzed)     │                               │  get_lab_reference_range       │
 │                                │                               │  (top 3 abnormal parameters)  │
 │                                │                               │◄─ reference data ─────────────┤
 │                                │                               │                               │
 │                                │                               ├─ Phase 2a: Ensemble ──────────►│
 │                                │                               │  2 providers in parallel       │
 │                                │                               │◄─ output_A + output_B ─────────┤
 │                                │                               ├─ Consensus judge ─────────────►│
 │                                │                               │◄─ merged medical analysis ─────┤
 │                                │                               │  (summary, abnormal findings)  │
 │                                │                               │                               │
 │                                │                               ├─ Phase 2b: Ensemble ──────────►│
 │                                │                               │  2 providers in parallel       │
 │                                │                               │◄─ output_A + output_B ─────────┤
 │                                │                               ├─ Consensus judge ─────────────►│
 │                                │                               │◄─ merged lifestyle plan ───────┤
 │                                │                               │  (diet plan, ingredients)      │
 │                                │                               │                               │
 │                                │                               ├─ Risk scoring agent ──────────►│
 │                                │                               │◄─ composite score 0-100 ───────┤
 │                                │                               │                               │
 │                                │                               ├─ Follow-up agent ─────────────►│
 │                                │                               │◄─ recheck schedule ────────────┤
 │                                │                               │                               │
 │                                │                               ├─ Save to DB                   │
 │                                │                               ├─ Schedule email reminders      │
 │                                │                               ├─ Auto-populate medication log  │
 │                                │                               │                               │
 │◄─ Full analysis dashboard ────┤◄─ GET /blood-report/:id ──────┤                               │
 │                                │                               │                               │
 │─── (Patient interacts with results) ─────────────────────────────────────────────────────────►│
 │                                │                               │                               │
 ├─ Ask chatbot question ───────► │                               │                               │
 │  (type or speak into mic)      ├─ POST /voice/report-chat ────►│                               │
 │                                │   { reportId, message, lang } ├─ AI responds in patient lang ─►│
 │◄─ Text reply ─────────────────┤◄──────────────────────────────┤◄──────────────────────────────┤
 │◄─ (auto-spoken via TTS) ──────┤◄─ POST /voice/speak ──────────┤◄─ ElevenLabs audio ───────────┤
 │                                │                               │                               │
 ├─ "Hear Report" button ───────► │                               │                               │
 │                                ├─ POST /voice/narrate-report ─►│                               │
 │                                │                               ├─ AI writes doctor script ─────►│
 │◄─ Doctor-style audio ─────────┤◄─ ElevenLabs TTS audio ───────┤◄──────────────────────────────┤
 │                                │                               │                               │
 ├─ Switch language ────────────► │                               │                               │
 │                                ├─ POST /voice/translate ──────►│                               │
 │                                │   { lang, texts }             ├─ Batch AI translation ────────►│
 │◄─ Translated report content ──┤◄─ cached in DB ───────────────┤◄──────────────────────────────┤
 │                                │                               │                               │
 ├─ Compare two reports ────────► │                               │                               │
 │                                ├─ GET /blood-report/compare ──►│                               │
 │◄─ Side-by-side diff ──────────┤◄─ diff + delta + trend ────────┤                               │
```

---

## 5. High-Level Design (HLD)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT  (React 18 + Vite)                               │
│                                                                                      │
│  ┌──────────────────┐  ┌───────────────────────┐  ┌──────────────────────────────┐  │
│  │   Auth Pages     │  │  Blood Report Pages   │  │   Supporting Pages           │  │
│  │  Login, Register │  │  Upload (file/camera) │  │  Report History, Comparison  │  │
│  │  2FA, Verify     │  │  Analysis Dashboard   │  │  Vitals, Profile, Badges     │  │
│  │  Forgot Password │  │  Report Chatbot       │  │  Admin, Emergency Medical ID │  │
│  │  Google OAuth    │  │  Voice Narration      │  │  Shared Report (public link) │  │
│  └──────────────────┘  │  Language Switcher    │  └──────────────────────────────┘  │
│                        └───────────────────────┘                                    │
│                                                                                      │
│              axios + JWT Bearer  /  SSE EventSource  /  i18next                     │
└───────────────────────────────────┬──────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────────────────────────────┐
│                              SERVER  (Express.js)                                    │
│                                                                                      │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │  /auth       │  │ /blood-report  │  │  /patient      │  │  /voice              │ │
│  │  /admin      │  │ upload, analyze│  │  profile       │  │  speak, narrate      │ │
│  │  /shared     │  │ compare        │  │  vitals        │  │  report-chat         │ │
│  │              │  │ history, export│  │  supplements   │  │  explain-finding     │ │
│  │              │  │ translate, tips│  │  badges        │  │  translate           │ │
│  └──────────────┘  └───────┬────────┘  └────────────────┘  └──────────────────────┘ │
│                            │                                                         │
│          ┌─────────────────▼─────────────────────────────────────────────────────┐  │
│          │                       AGENT LAYER                                     │  │
│          │                                                                       │  │
│          │  ┌────────────────────────────────────────────────────────────────┐  │  │
│          │  │                   ensembleRunner.js                            │  │  │
│          │  │                                                                │  │  │
│          │  │  ┌──────────────────────┐    ┌──────────────────────┐         │  │  │
│          │  │  │    Provider A        │    │    Provider B         │         │  │  │
│          │  │  │  SambaNova           │    │  Cerebras             │         │  │  │
│          │  │  │  Llama-3.3-70B       │    │  Qwen-3-235B          │         │  │  │
│          │  │  └──────────┬───────────┘    └───────────┬──────────┘         │  │  │
│          │  │             │   same prompt, parallel     │                    │  │  │
│          │  │             └──────────────┬──────────────┘                   │  │  │
│          │  │                            │ output_A + output_B              │  │  │
│          │  │                            ▼                                  │  │  │
│          │  │               ┌────────────────────────┐                     │  │  │
│          │  │               │    Consensus Judge      │                     │  │  │
│          │  │               │  GitHub GPT-4o-mini     │                     │  │  │
│          │  │               │  task-specific merge    │                     │  │  │
│          │  │               └────────────┬───────────┘                     │  │  │
│          │  └────────────────────────────┼───────────────────────────────── ┘  │  │
│          │                               │ merged, confidence-scored result     │  │
│          │                               ▼                                      │  │
│          │  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────────┐   │  │
│          │  │ bloodReportAgent │  │ riskScoring  │  │ followUpAgent        │   │  │
│          │  │ Phase 2a: medical│  │ Agent        │  │ (recheck schedule +  │   │  │
│          │  │ Phase 2b: lifestyle  │ (0-100 score)│  │  reminder trigger)   │   │  │
│          │  └──────────────────┘  └──────────────┘  └──────────────────────┘   │  │
│          └────────────────────────────────────────────────────────────────────── ┘  │
│                                                                                      │
│  ┌─────────────────────────┐  ┌────────────────────────┐  ┌──────────────────────┐  │
│  │  reminderService.js     │  │  pdfService.js          │  │  emailService.js     │  │
│  │  (hourly loop)          │  │  (Puppeteer / PDFKit)   │  │  (nodemailer)        │  │
│  └────────────┬────────────┘  └────────────────────────┘  └──────────────────────┘  │
└───────────────┼──────────────────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────────────────┐
│                        DATABASE  (PostgreSQL — Supabase)                             │
│                                                                                      │
│  users  ·  patient_profiles  ·  blood_reports  ·  vital_readings                    │
│  medication_logs  ·  supplement_logs  ·  reminders  ·  agent_logs  ·  audit_trail   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Multi-Agent Ensemble Architecture

### Why an Ensemble?

A single language model can hallucinate medical facts, produce unsafe dosage recommendations, or assign incorrect risk levels. Running the same query through two independent AI providers and merging their outputs through a consensus judge significantly reduces these failure modes — especially for safety-critical fields like drug interactions and diagnostic findings.

### How It Works

#### Step 1 — Parallel Dispatch

`ensembleRunner.js` sends the identical prompt to **2 AI providers simultaneously** (`MAX_ENSEMBLE_PROVIDERS = 2`). Both calls run via `Promise.all`, so total latency equals the slower of the two — not the sum.

```
                     ┌──► Provider A (SambaNova — Llama-3.3-70B)  ──► output_A ──┐
same prompt ─────────┤                                                             ├──► consensus judge
                     └──► Provider B (Cerebras  — Qwen-3-235B)    ──► output_B ──┘
```

#### Step 2 — Consensus Judge

A **third LLM call** (the "judge", run on GitHub GPT-4o-mini) receives both outputs and merges them using task-specific rules. The judge does not redo the analysis — it only adjudicates and combines.

```
output_A + output_B  ──►  Consensus Judge  ──►  merged_result (with confidence scores)
```

#### Step 3 — Confidence Scoring

| Agreement between agents | Confidence assigned |
|---|---|
| Both agents report the same finding | 0.8 – 1.0 (high) |
| Only one agent reports the finding | 0.4 – 0.6 (moderate — included with caveat) |

### Task-Specific Merge Rules

The consensus instructions differ per task to reflect medical domain priorities:

**Blood Report Analysis**
- Where agents agree: use the agreed value
- Where agents conflict: prefer the **conservative / safer** recommendation
- Each finding tagged with `consensus_note`: high / medium / low agreement

**Treatment Plans**
- 2+ agents agree → HIGH confidence; include in plan
- 1 agent only → include only if FDA-approved evidence exists
- Conflicting doses: prefer the **lower / safer dose** and **shorter duration**
- Any drug-drug interaction flagged by *either* agent is always surfaced

**Drug Interactions**
- 2+ agents → high confidence
- Conflicting severity: use the **more severe** classification (patient safety first)

**Test Recommendations**
- Tests from 2+ agents → high priority
- Fuzzy deduplication, sorted by consensus count

### Fallback Behavior

If only one provider is available (due to rate limiting), the consensus step is skipped and the single output is returned directly. Provider rate-limit state is tracked per-session so responses are always served.

### AI Provider Roster

| Provider | Model | Role |
|---|---|---|
| SambaNova | Meta-Llama-3.3-70B-Instruct | Primary ensemble member — stable, free tier |
| Cerebras | Qwen-3-235B-A22B-Instruct | Secondary ensemble member — strong medical reasoning |
| OpenRouter | Llama 3.1 8B / Mistral 7B | Lightweight fallback |
| GitHub Models | GPT-4o-mini | Consensus judge, voice scripts, translations |

Provider selection is **task-aware**: tool-calling tasks exclude OpenRouter free models (no reliable function-calling). Voice and translation tasks prefer GitHub Models for speed and higher rate limits.

---

## 7. Security Model

### Authentication

| Mechanism | Details |
|---|---|
| Password hashing | bcrypt with salt rounds |
| Access token | JWT, 7-day expiry; payload: `{ userId, role, name }` |
| Google OAuth | ID token verified server-side via `google-auth-library` |
| Two-Factor Auth (TOTP) | QR-code setup via `speakeasy`; login requires email + password + 6-digit TOTP code |

### Email-Based Security Flows

**Email Verification (Magic Link)**

On registration the server generates a cryptographically random token (24-hour expiry) and emails a verification link. Clicking the link calls `GET /auth/verify-email?token=...`, which validates the token, marks the account as verified, and issues a signed JWT. No password travels in this flow — the one-time token *is* the credential.

If the link expires: `POST /auth/resend-verification` issues a fresh 24-hour link.

**Forgot Password / Password Reset**

`POST /auth/forgot-password` creates a 1-hour reset token and emails a reset link. That link posts to `POST /auth/reset-password` with the token and new password. On success the token is invalidated and a confirmation email is sent. Tokens are single-use and time-bound.

### Rate Limiting

| Endpoint group | Limit |
|---|---|
| Auth (login, register) | 20 requests / 15 minutes |
| Agent endpoints (analyze) | 10 requests / minute |
| Email endpoints (forgot-password, resend) | 3 requests / minute |

### Report Share Tokens

48-hour expiry, read-only, scoped to a single report. Cannot be used to modify any data.

---

## 8. Follow-up Reminder System

After a blood report is analyzed, the follow-up agent (`followUpAgent.js`) evaluates every abnormal finding and recommends a recheck schedule:

| Finding Severity | Recommended Recheck |
|---|---|
| Critical value | 1–2 weeks |
| Significantly abnormal | 1–3 months |
| Mildly abnormal | 3–6 months |
| New medication started | 4–6 weeks (relevant labs only) |

The agent returns the top 3 follow-up items, each with: test name, recheck timeline, clinical reason, and priority (`urgent` / `routine` / `monitoring`).

### Automated Email Reminders

After follow-up analysis completes, `bloodReport.js` inserts rows into the `reminders` table with:

```
send_at = recheck_date − 3 days
```

`reminderService.js` runs a background loop that:
1. Starts automatically on server boot
2. Queries `reminders` every hour for unsent rows whose `send_at` ≤ now
3. Sends a personalized email via nodemailer with the patient's name, the specific test, the clinical reason, and the target recheck date
4. Marks the reminder `sent = true` to prevent duplicates

A patient who receives a follow-up recommendation for a hemoglobin recheck in 4 weeks will automatically receive an email 3 days before that date — no manual action required.

---

## 9. Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| React 18 + Vite | UI framework and build tooling |
| Tailwind CSS | Utility-first component styling |
| React Router v6 | Client-side routing |
| Recharts | Vital trend charts and health score sparklines |
| Framer Motion | Page and component animations |
| i18next / react-i18next | Bilingual UI strings (English + Spanish) |
| React Hook Form | Form state management and validation |
| Axios | HTTP client with automatic JWT Bearer injection |
| Web Speech API | Voice input (speech-to-text) in the chatbot |
| SpeechSynthesis API | Browser TTS fallback for Spanish chatbot voice output |

### Backend

| Technology | Purpose |
|---|---|
| Express.js | REST API server |
| PostgreSQL (Supabase) | Relational database |
| jsonwebtoken | JWT creation and verification |
| bcryptjs | Password and PIN hashing |
| multer | File upload handling |
| nodemailer | Transactional email (verification, reset, reminders) |
| speakeasy + qrcode | TOTP 2FA secret generation and QR code output |
| google-auth-library | Google OAuth ID token verification |
| pdf-parse | PDF text extraction |
| puppeteer-core + @sparticuz/chromium | Headless browser for PDF export |
| pdfkit | Programmatic PDF generation |

### AI and External APIs

| Service | Purpose |
|---|---|
| SambaNova (Llama-3.3-70B) | Primary ensemble AI provider |
| Cerebras (Qwen-3-235B) | Secondary ensemble AI provider |
| GitHub Models (GPT-4o-mini) | Consensus judge, narration scripts, translations |
| OpenRouter | Lightweight fallback tasks |
| Gemini Vision API | Blood report image OCR |
| ElevenLabs | Text-to-speech for chatbot voice output and report narration |
| OpenFDA | Drug reference data (free, 240 RPM, no key) |
| RxNorm (NIH) | Drug interaction lookup (free) |
| NIH ClinicalTables | ICD-10 code lookup (free) |

---

## 10. Project Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database (Supabase project recommended)
- API keys: SambaNova or Cerebras, GitHub Models, Gemini (for image OCR), ElevenLabs (for voice)

### Environment Variables

Create `medassist/server/.env`:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=your_jwt_secret_here

# AI Providers
SAMBANOVA_API_KEY=
CEREBRAS_API_KEY=
GITHUB_MODELS_API_KEY=
OPENROUTER_API_KEY=
GEMINI_API_KEY=

# Voice
ELEVENLABS_API_KEY=

# Optional observability
HELICONE_API_KEY=

# Google OAuth
GOOGLE_CLIENT_ID=

# Email (nodemailer)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
```

### Installation

```bash
# Server dependencies
cd medassist/server
npm install

# Client dependencies
cd ../client
npm install
```

### Database Setup

```bash
psql $DATABASE_URL -f medassist/server/db/schema.sql
```

### Live Deployment

| Layer | URL |
|---|---|
| Frontend | https://medassist-phi.vercel.app/ (Vercel) |
| Backend API | Render (set `VITE_API_URL` in Vercel env to point to your Render service URL) |

### Running Locally

```bash
# Terminal 1 — API server (port 5000)
cd medassist/server
npm run dev

# Terminal 2 — React client (port 5173)
cd medassist/client
npm run dev
```

Open `http://localhost:5173`.

---

## License

Built for CS 595 — Medical Informatics & AI, Illinois Institute of Technology.
