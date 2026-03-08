# MedAssist AI

> **AI-powered medical assistant** — symptom diagnosis, blood report analysis, and doctor assistance powered by autonomous AI agents.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-316192?logo=postgresql)](https://supabase.com/)
[![Groq](https://img.shields.io/badge/LLM-Groq%20llama--3.3--70b-orange)](https://groq.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

> **Medical Disclaimer**: MedAssist AI is for informational purposes only. It is **not** a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [AI Agents](#ai-agents)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Free APIs Used](#free-apis-used)

---

## Overview

MedAssist AI is a full-stack medical assistant web application with two user roles:

| Role | What they can do |
|------|-----------------|
| **Patient** | Enter symptoms → get AI disease diagnosis → see recommended blood tests → upload blood report → receive tablet recommendations, diet plan, and doctor referral guidance |
| **Doctor** | Input a patient case → AI identifies missing essential blood tests → confirms diagnosis with ICD-10 code |

The AI backbone uses **Groq** (`llama-3.3-70b-versatile`) with **tool calling** to run autonomous multi-turn agentic loops over real medical data from free public APIs — OpenFDA, RxNorm (NIH), and NIH ClinicalTables.

---

## Features

### Patient
- **Symptom Intake Wizard** — 3-step form: demographics, medical history (tag inputs for conditions/allergies/medications), and 36 symptoms across 7 body systems with severity, duration, and onset
- **AI Diagnostic Agent** — autonomous agent with ICD-10 tool lookups, returns top 5 diseases with confidence scores and descriptions
- **Live Agent Status** — Server-Sent Events stream shows every reasoning step and tool call in real time
- **Recommended Blood Tests** — per-diagnosis test list with reason and urgency level
- **Blood Report Upload** — upload JPG/PNG/PDF; Gemini Vision OCR extracts all lab values with normal ranges and status flags (low/high/critical)
- **Blood Report Analysis** — 3-phase AI pipeline generates a full medical analysis dashboard:
  - Summary & root cause assessment
  - Abnormal findings with clinical interpretation
  - Treatment advice
  - FDA-verified tablet recommendations (dosage, frequency, contraindications)
  - Personalized diet plan (foods to eat/avoid, meal schedule)
  - Recovery ingredients with targets
- **Doctor Finder Map** — interactive Leaflet map to find nearby doctors by city/state

### Doctor
- **Clinic Profile** — specialization, hospital, city, state, phone
- **Doctor Assist Agent** — input patient case + existing tests → AI returns missing essential tests, ICD-10 code, and coverage analysis
- **Session History** — full history of past assist sessions with agent step logs

### Platform
- **Role-Based Auth** — JWT (7-day), bcrypt password hashing, patient/doctor separation enforced at every route
- **Responsive UI** — TailwindCSS, mobile hamburger nav, print-optimized CSS
- **ARIA Accessibility** — skip-to-content, label/id bindings, aria-busy, role="dialog"
- **Agent Log Viewer** — expandable modal showing every tool call, argument, and result per turn

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Client (Vite)                       │
│                                                                  │
│   Auth  ──►  Patient Intake  ──►  Results  ──►  Upload Report   │
│                                       │              │           │
│              Doctor Dashboard  ◄──────┘    Analysis Dashboard   │
│                    │                              ▲              │
│           Doctor Assist Form               SSE step stream       │
└──────────────────────────┬───────────────────────┬──────────────┘
                           │ REST API               │ SSE
┌──────────────────────────▼───────────────────────▼──────────────┐
│                      Express.js API Server                       │
│                                                                  │
│   /api/auth          /api/patient          /api/disease          │
│   /api/blood-report  /api/doctor-assist    /api/agent-status     │
│   /api/nearby-doctors                      /api/agent-logs       │
└──────────────────────────┬───────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────┐ ┌──────────────────┐
│ diagnosticAgent │ │bloodReport  │ │ doctorAssist     │
│                 │ │Agent        │ │ Agent            │
│ lookup_icd_code │ │             │ │ lookup_icd_code  │
│                 │ │get_lab_ref  │ │ get_lab_ref      │
│                 │ │search_drug  │ │ search_drug      │
│                 │ │get_drug_det │ │                  │
│                 │ │check_drug_  │ │                  │
│                 │ │interactions │ │                  │
└────────┬────────┘ └──────┬──────┘ └────────┬─────────┘
         └─────────────────┼─────────────────┘
                           │ shared agentRunner.js
                           │ (MAX_TURNS=6, 2s delay, 429 retry)
                           ▼
          ┌────────────────────────────────┐
          │      Groq API                  │
          │  llama-3.3-70b-versatile       │
          │  (tool calling / function use) │
          └────────────────────────────────┘
                           │ tool calls
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
   │ NIH         │  │  OpenFDA     │  │  RxNorm      │
   │ ClinicalTab │  │  Drug Search │  │  Drug Inter- │
   │ ICD-10      │  │  + Details   │  │  actions     │
   └─────────────┘  └──────────────┘  └──────────────┘
                           │
          ┌────────────────────────────────┐
          │       PostgreSQL (Supabase)    │
          │                                │
          │  users                         │
          │  patient_profiles              │
          │  symptom_sessions              │
          │  blood_reports                 │
          │  doctor_profiles               │
          │  doctor_assist_sessions        │
          │  agent_logs                    │
          └────────────────────────────────┘
```

### Patient Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1 — Symptom Intake Wizard                                 │
│  Demographics → Medical History → 36 Symptoms (7 systems)      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ POST /api/disease/predict
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2 — Diagnostic Agent (Groq + ICD-10 tools)                │
│  Returns: top 5 diseases, ICD codes, confidence, urgency        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3 — Recommended Blood Tests                               │
│  Per-diagnosis test list with reason and urgency level          │
└─────────────────────────────┬───────────────────────────────────┘
                              │ POST /api/blood-report/upload
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4 — Blood Report OCR (Gemini Vision)                      │
│  Extracts: parameter, value, unit, normal_range, status         │
└─────────────────────────────┬───────────────────────────────────┘
                              │ POST /api/blood-report/analyze
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5 — Blood Report Agent                                    │
│  Phase 1: tool calls (lab ranges, drug search, drug details)    │
│  Phase 2a: medical JSON (summary, findings, tablets)            │
│  Phase 2b: lifestyle JSON (diet plan, recovery ingredients)     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 6 — Analysis Dashboard (6 tabs)                           │
│  Summary · Findings · Treatment · Tablets · Diet · Recovery     │
└─────────────────────────────────────────────────────────────────┘
```

---

## AI Agents

### Agent 1 — Diagnostic Agent (`diagnosticAgent.js`)

| | |
|---|---|
| **Input** | Patient demographics + 36-symptom assessment (severity/duration/onset) |
| **Tools** | `lookup_icd_code` — queries NIH ClinicalTables for ICD-10 codes |
| **Output** | Top 5 differential diagnoses with ICD code, confidence %, description, urgency, recommended tests |
| **Stop condition** | Model outputs `DIAGNOSIS_COMPLETE` |

### Agent 2 — Blood Report Agent (`bloodReportAgent.js`)

| | |
|---|---|
| **Input** | OCR-extracted blood values, patient profile |
| **Tools** | `get_lab_reference_range`, `search_drug_by_condition`, `get_drug_details`, `check_drug_interactions` |
| **Phase 1** | Autonomous tool calls — gathers lab reference ranges and FDA drug data (max 5 tool calls) |
| **Phase 2a** | Direct LLM call — generates medical JSON: summary, abnormal findings, treatment, tablet recommendations |
| **Phase 2b** | Direct LLM call — generates lifestyle JSON: diet plan, recovery ingredients |
| **Rate-limit safe** | 3s delay between phases, 429 retry with `retry-after` header, 2,000-token capped outputs |

### Agent 3 — Doctor Assist Agent (`doctorAssistAgent.js`)

| | |
|---|---|
| **Input** | Patient case (age, gender, chief complaint, symptoms, known conditions) + list of existing tests |
| **Tools** | `lookup_icd_code`, `get_lab_reference_range`, `search_drug_by_condition` |
| **Output** | Missing essential tests, ICD-10 code, coverage analysis (`allCovered` boolean) |
| **Access** | Doctor role only |

### Shared Agent Runner (`agentRunner.js`)

```js
MAX_TURNS            = 6        // Hard limit — prevents runaway API calls
INTER_TURN_DELAY_MS  = 2000     // 2s pause between turns (TPM budget)
MAX_RETRIES          = 2        // On 429, reads retry-after header
DEFAULT_MAX_TOKENS   = 1500
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, React Router v6, TailwindCSS |
| **UI Components** | react-hot-toast, react-hook-form, Lucide React icons |
| **Maps** | Leaflet + react-leaflet, OpenStreetMap tiles (no API key) |
| **Backend** | Node.js 18+, Express.js |
| **Database** | PostgreSQL via Supabase (SSL, `rejectUnauthorized: false`) |
| **Authentication** | jsonwebtoken (JWT, 7-day), bcrypt |
| **Primary LLM** | Groq API — `llama-3.3-70b-versatile` (12,000 TPM free tier) |
| **Vision OCR** | Google Gemini API — `gemini-1.5-flash` |
| **File Upload** | Multer — JPEG/PNG/PDF, max 10MB |
| **Real-time** | Server-Sent Events (SSE) — live agent step streaming |
| **Medical APIs** | OpenFDA, RxNorm (NIH), NIH ClinicalTables, OpenStreetMap Nominatim |
| **Testing** | Plain Node.js `http` — 29 integration tests, zero external dependencies |

---

## Project Structure

```
medassist/
├── client/                          # React + Vite frontend
│   ├── index.html                   # Title, favicon, meta description
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                  # Route definitions + layout wrapper
│       ├── index.css                # Tailwind directives, print CSS, animations
│       ├── context/
│       │   └── AuthContext.jsx      # JWT auth state (localStorage persistence)
│       ├── services/
│       │   └── api.js               # Axios instance with auto Bearer token
│       ├── components/
│       │   ├── Layout/
│       │   │   └── Navbar.jsx       # Role-based nav links + mobile hamburger
│       │   ├── AgentStatus/         # SSE live step stream UI component
│       │   └── AgentLogModal.jsx    # Full agent log viewer (ARIA dialog)
│       ├── hooks/
│       │   └── useAgentStatus.js    # SSE hook (EventSource lifecycle)
│       └── pages/
│           ├── Auth/
│           │   ├── Login.jsx
│           │   └── Register.jsx
│           ├── Patient/
│           │   ├── Intake.jsx       # 3-step symptom wizard
│           │   ├── Results.jsx      # Diagnostic results (top 5 diseases)
│           │   ├── Tests.jsx        # Recommended blood tests
│           │   ├── UploadReport.jsx # OCR upload + extracted values preview
│           │   ├── Analysis.jsx     # Full 6-tab analysis dashboard
│           │   └── FindDoctors.jsx  # Leaflet map + doctor list
│           └── Doctor/
│               ├── Dashboard.jsx    # Session history
│               └── DoctorAssist.jsx # Case input form + missing tests results
│
└── server/                          # Express.js backend
    ├── index.js                     # App entry — mounts all routes
    ├── package.json
    ├── db/
    │   ├── pool.js                  # Supabase pool (SSL enabled)
    │   ├── schema.sql               # Full database schema
    │   └── migrations/              # Incremental schema changes
    ├── middleware/
    │   ├── auth.js                  # verifyToken — JWT middleware
    │   └── upload.js                # Multer config (file type + size limits)
    ├── models/
    │   ├── User.js                  # findByEmail, createUser
    │   ├── patientQueries.js        # Patient profile + session queries
    │   └── doctorQueries.js         # Doctor profile + assist session queries
    ├── routes/
    │   ├── auth.js                  # POST /register, /login
    │   ├── patient.js               # GET/PUT /profile, GET /sessions
    │   ├── disease.js               # POST /predict
    │   ├── bloodReport.js           # POST /upload, /analyze; GET /:id
    │   ├── doctorAssist.js          # POST /suggest-tests; GET/PUT /profile; GET /sessions
    │   ├── agentStatus.js           # GET /stream/:sessionId (SSE)
    │   ├── nearbyDoctors.js         # GET /nearby-doctors?city=&state=
    │   └── agentLogs.js             # GET /:sessionId
    ├── agents/
    │   ├── agentRunner.js           # Shared Groq agentic loop (all 3 agents use this)
    │   ├── diagnosticAgent.js       # Symptom → differential diagnosis
    │   ├── bloodReportAgent.js      # Blood values → full medical analysis
    │   ├── doctorAssistAgent.js     # Patient case → missing tests
    │   └── tools/
    │       ├── medicalTools.js      # All tool definitions + request handlers
    │       └── icdLookup.js         # NIH ClinicalTables API wrapper
    ├── services/
    │   └── geminiService.js         # Gemini Vision OCR — returns structured lab values
    ├── utils/
    │   ├── aiClient.js              # Groq client singleton + MODEL constant
    │   └── eventEmitter.js          # Per-session EventEmitter Map (for SSE)
    └── tests/
        └── integration.js           # 29-test end-to-end suite
```

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** — or a free [Supabase](https://supabase.com/) project
- **Groq API key** — [console.groq.com](https://console.groq.com/) (free, no credit card)
- **Gemini API key** — [aistudio.google.com](https://aistudio.google.com/) (free tier)

### 1. Clone

```bash
git clone https://github.com/your-username/medassist-ai.git
cd medassist-ai/medassist
```

### 2. Apply Database Schema

```bash
psql $DATABASE_URL < server/db/schema.sql
```

Or paste the contents of `server/db/schema.sql` into the Supabase SQL editor.

### 3. Install Dependencies

```bash
# Backend
cd server && npm install

# Frontend
cd ../client && npm install
```

### 4. Configure Environment

```bash
cp server/.env.example server/.env
# Edit server/.env with your keys (see Environment Variables below)
```

### 5. Run

```bash
# Terminal 1 — API server (port 5000)
cd server && npm run dev

# Terminal 2 — React dev server (port 5173)
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Environment Variables

`medassist/server/.env`:

```env
# PostgreSQL — Supabase connection string
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres

# JWT signing secret (use a long random string)
JWT_SECRET=replace-with-a-long-random-secret

# Groq API — primary LLM for all three agents
GROQ_API_KEY=gsk_...

# Google Gemini API — blood report OCR only
GEMINI_API_KEY=AIza...

# Server
PORT=5000
NODE_ENV=development
```

> **Rate limit note**: Groq's free tier allows **12,000 tokens/minute** for `llama-3.3-70b-versatile`. The app handles this with 2-second inter-turn delays, `retry-after` header-aware retries, and split Phase 2 calls (each capped at 2,000 tokens).

---

## API Reference

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

### Authentication

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| `POST` | `/api/auth/register` | `{ name, email, password, role }` | `{ token, user }` |
| `POST` | `/api/auth/login` | `{ email, password }` | `{ token, user }` |

`role` must be `"patient"` or `"doctor"`.

### Patient

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/patient/profile` | ✓ | Get patient profile |
| `PUT` | `/api/patient/profile` | ✓ | Create or update patient profile |
| `GET` | `/api/patient/sessions` | ✓ | List recent symptom sessions |

### Disease Diagnosis

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/disease/predict` | ✓ | Run diagnostic agent. Body: `{ sessionId, symptoms, profile }` |

### Blood Report

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/blood-report/upload` | ✓ | Upload image/PDF, run OCR. `multipart/form-data`, field `report`. Returns `{ reportId, extractedValues }` |
| `POST` | `/api/blood-report/analyze` | ✓ | Run analysis agent on saved report. Body: `{ reportId }` |
| `GET` | `/api/blood-report/:id` | ✓ | Fetch saved report + cached analysis |

### Agent Status (SSE)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/agent-status/stream/:sessionId` | ✓ | EventSource — streams `step` events during agent execution |

SSE event format:
```
event: step
data: {"tool":"lookup_icd_code","args":{...},"result":{...},"turn":1}
```

### Doctor Assist

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/doctor-assist/suggest-tests` | ✓ doctor | Run doctor assist agent. Body: `{ patientCase, existingTests }` |
| `GET` | `/api/doctor-assist/sessions` | ✓ doctor | Last 10 assist sessions |
| `GET` | `/api/doctor-assist/profile` | ✓ doctor | Get clinic profile |
| `PUT` | `/api/doctor-assist/profile` | ✓ doctor | Create or update clinic profile |

### Nearby Doctors

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/nearby-doctors` | ✓ | Query: `?city=Phoenix&state=AZ` — returns matching doctors from DB |

### Agent Logs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/agent-logs/:sessionId` | ✓ | Returns `{ steps, total_turns, agent_name }` for a session |

---

## Database Schema

```sql
-- Authentication
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patient', 'doctor')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Patient profile (one per user)
CREATE TABLE patient_profiles (
  id                   SERIAL PRIMARY KEY,
  user_id              INT REFERENCES users(id) ON DELETE CASCADE,
  age                  INT,
  gender               TEXT,
  weight_kg            NUMERIC,
  height_cm            NUMERIC,
  blood_group          TEXT,
  existing_conditions  TEXT[],
  allergies            TEXT[],
  current_medications  TEXT[],
  smoking_status       TEXT,
  alcohol_use          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Symptom sessions (one per diagnostic run)
CREATE TABLE symptom_sessions (
  id               SERIAL PRIMARY KEY,
  patient_id       INT REFERENCES users(id),
  symptoms         JSONB,
  profile_snapshot JSONB,
  diagnosis        JSONB,        -- top 5 diseases from agent
  status           TEXT DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Blood reports
CREATE TABLE blood_reports (
  id                      SERIAL PRIMARY KEY,
  session_id              INT,
  patient_id              INT REFERENCES users(id),
  image_path              TEXT,
  extracted_values        JSONB,   -- OCR output
  analysis                JSONB,   -- agent Phase 2a+2b output
  tablet_recommendations  JSONB,
  complexity_flag         BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor profiles
CREATE TABLE doctor_profiles (
  id              SERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id) ON DELETE CASCADE,
  specialization  TEXT,
  hospital_name   TEXT,
  city            TEXT,
  state           TEXT,
  phone           TEXT,
  available       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor assist sessions
CREATE TABLE doctor_assist_sessions (
  id           SERIAL PRIMARY KEY,
  doctor_id    INT REFERENCES users(id),
  patient_case JSONB,
  suggestions  JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Agent telemetry
CREATE TABLE agent_logs (
  id          SERIAL PRIMARY KEY,
  session_id  INT,
  agent_name  TEXT,
  steps       JSONB,
  total_turns INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Testing

A 29-test integration suite runs against the live API using plain Node.js `http` — no test framework needed.

```bash
cd medassist/server
node tests/integration.js
```

**Coverage:**

| Category | Tests |
|----------|-------|
| Server health | 1 |
| Auth (register, login, JWT, role enforcement) | 5 |
| Patient profile (create, read, update) | 4 |
| Diagnostic agent (run + session persistence) | 3 |
| Blood report (upload, analyze, cache) | 4 |
| Patient session history | 1 |
| Doctor profile (create, update) | 3 |
| Doctor assist agent (run + session save) | 3 |
| Doctor session history | 1 |
| Agent logs | 1 |
| Nearby doctors query | 1 |
| Edge cases (missing fields, wrong role, invalid token) | 2 |
| **Total** | **29** |

---

## Free APIs Used

| API | Purpose | Limit |
|-----|---------|-------|
| [Groq](https://console.groq.com/) | LLM inference for all 3 agents | 12,000 TPM free |
| [Google Gemini](https://ai.google.dev/) | Vision OCR for blood report images | 15 req/min free |
| [OpenFDA](https://open.fda.gov/apis/) | Drug search by condition + drug details | 240 req/min (no key) |
| [RxNorm API — NIH](https://rxnav.nlm.nih.gov/) | Drug interaction checking | No hard limit |
| [NIH ClinicalTables](https://clinicaltables.nlm.nih.gov/) | ICD-10 code lookup | No hard limit |
| [OpenStreetMap Nominatim](https://nominatim.org/) | Geocoding for doctor finder map | 1 req/s |

All external APIs are called server-side only. No API keys are exposed to the frontend.

---

## License

MIT © 2024 — See [LICENSE](LICENSE) for details.

**Medical Disclaimer**: This software is provided for informational and educational purposes only. It does not constitute medical advice. Outputs from AI agents are not reviewed by licensed medical professionals and should not be used to make health decisions.
