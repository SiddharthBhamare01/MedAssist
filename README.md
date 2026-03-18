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
- [Current Features](#current-features)
- [Architecture](#architecture)
- [AI Agents](#ai-agents)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Session Status Flow](#session-status-flow)
- [Testing](#testing)
- [Free APIs Used](#free-apis-used)
- [Enterprise Roadmap](#enterprise-roadmap)
- [License](#license)

---

## Overview

MedAssist AI is a full-stack healthcare web application built as a CS 595 (Medical Informatics & AI) project. It provides two distinct user roles with end-to-end AI-assisted medical workflows:

| Role | Workflow |
|------|---------|
| **Patient** | Enter symptoms → AI diagnosis → recommended blood tests → upload lab report → full analysis (medications, diet, recovery) → find a nearby doctor |
| **Doctor** | Enter patient case + existing tests → AI identifies missing essential tests → confirms diagnosis with ICD-10 code |

The AI backbone uses **Groq** (`llama-3.3-70b-versatile`) with **tool calling** to run autonomous multi-turn agentic loops over real medical data from free public APIs — OpenFDA, RxNorm (NIH), and NIH ClinicalTables. All patient sessions are saved and resumable — a patient can close the browser after getting their test list and come back days later (after getting blood work done) to upload their report and continue exactly where they left off.

---

## Current Features

### Patient

- **Patient Dashboard** — Central hub showing all in-progress and completed sessions with a 5-step progress bar and one-click resume to the correct step
- **Symptom Intake Wizard** — 3-step form: demographics, medical history (tag inputs for conditions/allergies/medications), and 36 symptoms across 7 body systems with severity, duration, and onset
- **AI Diagnostic Agent** — Autonomous agent with ICD-10 tool lookups, returns top 5 diseases with confidence scores and descriptions
- **Live Agent Status** — Server-Sent Events stream shows every reasoning step and tool call in real time
- **Recommended Blood Tests** — Per-diagnosis test list with reason, urgency level, and normal ranges
- **Save & Resume Flow** — Full session persisted in DB; patient can resume from any step after days/weeks
- **Blood Report Upload** — Upload JPG/PNG/PDF; AI OCR extracts all lab values with normal ranges and status flags (low/high/critical)
- **Blood Report Analysis** — 3-phase AI pipeline generates a full medical analysis dashboard:
  - Summary & root cause assessment with complexity flag
  - Abnormal findings with clinical interpretation
  - Treatment advice
  - FDA-verified tablet recommendations (dosage, frequency, contraindications)
  - Personalized diet plan (foods to eat/avoid, meal schedule)
  - Recovery ingredients with benefits and usage instructions
- **Doctor Finder Map** — Interactive Leaflet map with real-time OpenStreetMap data, specialty filter, radius selector (2–50 mi), distance display, directions link

### Doctor

- **Doctor Profile** — Specialization, hospital, city, state, phone
- **Doctor Assist Agent** — Input patient case + existing tests → AI returns missing essential tests with urgency, clinical reason, and reference ranges
- **Session History** — Full history of past assist sessions with patient case summary and urgency badges
- **Agent Log Viewer** — Expandable modal showing every tool call, argument, and result per agent turn

### Platform

- **Role-Based Auth** — JWT (7-day), bcrypt password hashing, patient/doctor separation enforced at every route
- **Responsive UI** — TailwindCSS, mobile hamburger nav, print-optimized CSS on test pages
- **ARIA Accessibility** — Skip-to-content, label/id bindings, aria-busy, role="dialog"
- **Error Boundary** — Catches React errors with Try Again + Go Home recovery
- **Rate Limit Handling** — 429 retry with `retry-after` header awareness, per-agent turn delays

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Client (Vite)                       │
│                                                                  │
│  Dashboard ──► Intake ──► Results ──► Tests ──► Upload ──► Analysis
│      │                       │                              ▲   │
│   (resume)           Doctor Dashboard ◄──────────  SSE steps    │
│                            │                                     │
│                      Doctor Assist Form                          │
└──────────────────────────┬───────────────────────┬──────────────┘
                           │ REST API               │ SSE
┌──────────────────────────▼───────────────────────▼──────────────┐
│                      Express.js API Server                       │
│                                                                  │
│  /api/auth          /api/patient         /api/disease            │
│  /api/blood-report  /api/doctor-assist   /api/agent/status       │
│  /api/doctors       /api/agent/logs                              │
└──────────────────────────┬───────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────┐ ┌──────────────────┐
│ diagnosticAgent │ │ bloodReport │ │  doctorAssist    │
│                 │ │ Agent       │ │  Agent           │
│ lookup_icd_code │ │             │ │  lookup_icd_code │
│                 │ │ get_lab_ref │ │  get_lab_ref     │
│                 │ │ search_drug │ │                  │
│                 │ │ get_drug_dt │ │                  │
│                 │ │ check_inter │ │                  │
└────────┬────────┘ └──────┬──────┘ └────────┬─────────┘
         └─────────────────┼─────────────────┘
                           │ shared agentRunner.js
                           ▼
          ┌────────────────────────────────┐
          │      Groq API                  │
          │  llama-3.3-70b-versatile       │
          │  MAX_TURNS=6 | 2s delay | 429  │
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
          │  users · patient_profiles      │
          │  symptom_sessions              │
          │  blood_reports                 │
          │  doctor_profiles               │
          │  doctor_assist_sessions        │
          │  agent_logs                    │
          └────────────────────────────────┘
```

### Patient Data Flow

```
Step 1 — Symptom Intake Wizard
Demographics → Medical History → 36 Symptoms (7 systems)
                     │
                     ▼ POST /api/disease/predict
Step 2 — Diagnostic Agent (Groq + ICD-10 tools)
Returns: top 5 diseases, ICD codes, confidence, urgency
                     │
                     ▼ PUT /api/patient/sessions/:id/disease
Step 3 — Select Disease + Recommended Blood Tests
Per-diagnosis test list with reason and urgency level
[Patient leaves to get blood work done — session saved]
                     │
                     ▼ POST /api/blood-report/upload
Step 4 — Blood Report OCR (Gemini Vision / pdf-parse + Groq)
Extracts: parameter, value, unit, normal_range, status
                     │
                     ▼ POST /api/blood-report/analyze
Step 5 — Blood Report Agent (3 phases)
Phase 1: tool calls (lab ranges, drug search, drug details)
Phase 2a: medical JSON (summary, findings, tablets)
Phase 2b: lifestyle JSON (diet plan, recovery ingredients)
                     │
                     ▼
Step 6 — Analysis Dashboard (6 sections)
Summary · Findings · Treatment · Tablets · Diet · Recovery
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
| **Status update** | Sets `symptom_sessions.status = 'diagnosed'` on completion |

### Agent 2 — Blood Report Agent (`bloodReportAgent.js`)

| | |
|---|---|
| **Input** | OCR-extracted blood values, patient profile |
| **Tools** | `get_lab_reference_range`, `search_drug_by_condition`, `get_drug_details`, `check_drug_interactions` |
| **Phase 1** | Autonomous tool calls — gathers lab reference ranges and FDA drug data (max 5 tool calls) |
| **Phase 2a** | Direct LLM call — generates medical JSON: summary, abnormal findings, treatment, tablet recommendations |
| **Phase 2b** | Direct LLM call — generates lifestyle JSON: diet plan, recovery ingredients |
| **Rate-limit safe** | 3s delay between phases, 429 retry with `retry-after` header, 2,000-token capped outputs |
| **Status update** | Sets `symptom_sessions.status = 'analyzed'` on completion |

### Agent 3 — Doctor Assist Agent (`doctorAssistAgent.js`)

| | |
|---|---|
| **Input** | Patient case (age, gender, chief complaint, symptoms, known conditions) + list of existing tests |
| **Tools** | `lookup_icd_code`, `get_lab_reference_range` |
| **Output** | Missing essential tests with urgency, ICD-10 code, coverage analysis (`allCovered` boolean) |
| **Access** | Doctor role only |

### Shared Agent Runner (`agentRunner.js`)

```js
MAX_TURNS            = 6        // Hard limit — prevents runaway API calls
INTER_TURN_DELAY_MS  = 2000     // 2s pause between turns (TPM budget)
MAX_RETRIES          = 3        // On 429, reads retry-after header
DEFAULT_MAX_TOKENS   = 1500
```

### Medical Tool Definitions

| Tool | API | Purpose |
|------|-----|---------|
| `lookup_icd_code` | NIH ClinicalTables | Search disease name → ICD-10-CM code + description |
| `get_lab_reference_range` | Local table (40 params) | Normal ranges, units, critical thresholds for CBC, BMP, LFT, lipids, thyroid, vitamins |
| `search_drug_by_condition` | OpenFDA | Find FDA-approved drugs for a medical condition |
| `get_drug_details` | OpenFDA drug label | Dosage, contraindications, warnings for a specific drug |
| `check_drug_interactions` | RxNorm NIH | Interaction data between 2+ drugs |

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
│   ├── index.html
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
│       │   ├── AgentLogModal.jsx    # Full agent log viewer (ARIA dialog)
│       │   └── ErrorBoundary.jsx    # React error boundary with recovery UI
│       ├── hooks/
│       │   └── useAgentStatus.js    # SSE hook (EventSource lifecycle)
│       └── pages/
│           ├── Auth/
│           │   ├── Login.jsx
│           │   └── Register.jsx
│           ├── Patient/
│           │   ├── PatientDashboard.jsx  # Session hub + resume buttons
│           │   ├── Intake.jsx            # 3-step symptom wizard
│           │   ├── Results.jsx           # Diagnostic results (top 5 diseases)
│           │   ├── Tests.jsx             # Recommended blood tests
│           │   ├── UploadReport.jsx      # OCR upload + extracted values preview
│           │   ├── Analysis.jsx          # Full 6-section analysis dashboard
│           │   └── Doctors.jsx           # Leaflet map + doctor list
│           └── Doctor/
│               ├── Dashboard.jsx         # Session history
│               └── Assist.jsx            # Case input form + missing tests results
│
└── server/                          # Express.js backend
    ├── index.js                     # App entry — mounts all routes
    ├── package.json
    ├── db/
    │   ├── pool.js                  # Supabase pool (SSL enabled)
    │   ├── schema.sql               # Full database schema
    │   └── migrations/
    │       ├── 001_recommended_tests_jsonb.sql
    │       └── 002_session_status.sql   # status + selected_disease_data columns
    ├── middleware/
    │   ├── auth.js                  # verifyToken — JWT middleware
    │   └── upload.js                # Multer config (file type + size limits)
    ├── models/
    │   ├── User.js                  # findByEmail, createUser
    │   ├── patientQueries.js        # Patient profile + session queries + status tracking
    │   └── doctorQueries.js         # Doctor profile + assist session queries
    ├── routes/
    │   ├── auth.js                  # POST /register, /login
    │   ├── patient.js               # GET/PUT /profile; GET/GET/:id /sessions; PUT /:id/disease
    │   ├── disease.js               # POST /predict, /tests
    │   ├── bloodReport.js           # POST /upload, /analyze; GET /:id
    │   ├── doctorAssist.js          # POST /suggest-tests; GET/PUT /profile; GET /sessions
    │   ├── agentStatus.js           # GET /stream/:sessionId (SSE) + GET /logs/:sessionId
    │   ├── doctors.js               # GET /nearby?lat=&lng=&radius= (OSM + fallback)
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
    │   ├── geminiService.js         # Gemini Vision OCR — returns structured lab values
    │   ├── groqService.js           # Blood test recommendation single-turn call
    │   ├── locationService.js       # Haversine distance calculation
    │   └── osmService.js            # Overpass API wrapper (3 mirrors, 5-min cache)
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
psql $DATABASE_URL < server/db/migrations/001_recommended_tests_jsonb.sql
psql $DATABASE_URL < server/db/migrations/002_session_status.sql
```

Or paste each file's contents into the Supabase SQL editor.

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
# Edit server/.env with your keys
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
| `POST` | `/api/auth/register` | `{ fullName, email, password, role }` | `{ token, user }` |
| `POST` | `/api/auth/login` | `{ email, password }` | `{ token, user }` |

`role` must be `"patient"` or `"doctor"`.

### Patient Profile

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/patient/profile` | ✓ | Get patient profile |
| `PUT` | `/api/patient/profile` | ✓ | Create or update patient profile |

### Patient Sessions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/patient/sessions` | ✓ | List recent sessions (with status + report_id) |
| `GET` | `/api/patient/sessions/:id` | ✓ | Get single session (ownership checked) |
| `PUT` | `/api/patient/sessions/:id/disease` | ✓ | Save selected disease + advance status to `tests_ready` |

### Disease Diagnosis

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/disease/predict` | ✓ | Run diagnostic agent. Body: `{ symptoms }` |
| `POST` | `/api/disease/tests` | ✓ | Get blood test recommendations. Body: `{ sessionId, disease }` |

### Blood Report

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/blood-report/upload` | ✓ | Upload image/PDF, run OCR. `multipart/form-data`, field `report`. Body also accepts `sessionId`. Returns `{ reportId, extractedValues }` |
| `POST` | `/api/blood-report/analyze` | ✓ | Run analysis agent. Body: `{ reportId }` |
| `GET` | `/api/blood-report/:id` | ✓ | Fetch saved report + cached analysis |

### Agent Status (SSE)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/agent/status/:sessionId` | ✓ | EventSource — streams `step` events during agent execution |

SSE event format:
```
event: step
data: {"tool":"lookup_icd_code","args":{...},"result":{...},"turn":1}

event: done
data: {"turns":3}

event: error
data: {"message":"Agent failed"}
```

### Agent Logs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/agent/logs/:sessionId` | ✓ | Returns `{ steps, total_turns, agent_name }` for a session |

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
| `GET` | `/api/doctors/nearby` | ✓ | Query: `?lat=33.4&lng=-112.0&radius=8047` — returns nearby doctors from OSM with fallback to DB |

---

## Database Schema

```sql
-- Authentication (shared for patients and doctors)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patient', 'doctor')),
  full_name     TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Patient health profile
CREATE TABLE patient_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
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
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Symptom sessions (one per diagnostic run)
CREATE TABLE symptom_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID REFERENCES users(id),
  symptoms              JSONB NOT NULL,
  predicted_diseases    JSONB,
  selected_disease      TEXT,
  selected_disease_data JSONB,              -- full disease object for resume
  recommended_tests     JSONB,
  status                TEXT DEFAULT 'pending',  -- pending|diagnosed|tests_ready|report_uploaded|analyzed
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Blood reports
CREATE TABLE blood_reports (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID REFERENCES symptom_sessions(id),
  patient_id              UUID REFERENCES users(id),
  image_path              TEXT NOT NULL,
  extracted_values        JSONB,
  analysis                JSONB,
  tablet_recommendations  JSONB,
  complexity_flag         BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor profiles
CREATE TABLE doctor_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  specialization  TEXT,
  hospital_name   TEXT,
  city            TEXT,
  state           TEXT,
  latitude        FLOAT,
  longitude       FLOAT,
  phone           TEXT,
  available       BOOLEAN DEFAULT TRUE
);

-- Doctor assist sessions
CREATE TABLE doctor_assist_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID REFERENCES users(id),
  patient_summary JSONB,
  suggested_tests TEXT[],
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Agent telemetry
CREATE TABLE agent_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID,
  agent_name  TEXT,
  steps       JSONB,
  total_turns INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Session Status Flow

Every patient session tracks progress through 5 states:

```
pending
  │  Session created, diagnostic agent running
  ▼
diagnosed
  │  Top 5 diseases returned by agent, saved to DB
  ▼
tests_ready
  │  Patient selected a disease, blood test recommendations saved
  │  [Patient goes to a lab — may close browser and return days later]
  ▼
report_uploaded
  │  Blood report PDF/image uploaded, OCR extraction complete
  ▼
analyzed
     Full blood report analysis complete (medications, diet, recovery)
```

The **PatientDashboard** reads this status and routes the resume button to the correct page:

| Status | Resume destination |
|--------|-------------------|
| `diagnosed` | `/patient/results/:sessionId` |
| `tests_ready` | `/patient/tests/:sessionId` |
| `report_uploaded` | `/patient/analysis/:reportId` |
| `analyzed` | `/patient/analysis/:reportId` |

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
| [Overpass API](https://overpass-api.de/) | Real-time nearby healthcare facility data | Fair use |

All external APIs are called server-side only. No API keys are exposed to the frontend.

---

## Enterprise Roadmap

The features below are planned enhancements to grow MedAssist AI from a course project into a production-grade healthcare platform. They are grouped by category and prioritized.

### Priority Levels

| Symbol | Meaning |
|--------|---------|
| 🔴 **P0** | Critical — implement first |
| 🟠 **P1** | High value — implement next |
| 🟡 **P2** | Medium value — planned |
| 🟢 **P3** | Nice to have |

---

### Patient Features

#### 🔴 P2 — PDF Medical Summary Export
One-click export of a full diagnostic session as a printable PDF — includes diagnosis, test list, analysis results, tablet plan, and diet plan. Patient takes this to their real doctor.
- **Backend:** `pdfkit` or `puppeteer` server-side rendering
- **New API:** `GET /api/patient/sessions/:id/export-pdf`
- **New UI:** "Export as PDF" button on Analysis page

#### 🟠 P1 — Health Vitals Tracker
Let patients log daily vitals — blood pressure, glucose, weight, heart rate, SpO2, temperature — and view trend charts over time.
- **New DB table:** `vitals_logs (patient_id, type, value, unit, recorded_at)`
- **New API:** `POST /api/vitals`, `GET /api/vitals?type=glucose&days=30`
- **New pages:** Vitals entry form, line-chart dashboard (recharts)
- **AI integration:** Feed last 30 days of vitals into diagnostic agent context

#### 🟠 P1 — Share Report with Doctor
Patient generates a secure, expiring token link to share their analysis with any doctor — even one not on the platform.
- **New DB table:** `report_shares (token, report_id, patient_id, expires_at, accessed_at)`
- **New API:** `POST /api/patient/sessions/:id/share` → token; `GET /api/shared/:token` → read-only view
- **New pages:** Shared report viewer (public, no auth required)

#### 🟡 P2 — Medication Tracker & Reminders
After receiving tablet recommendations, patient marks medications as active, logs daily doses taken, and sees a medication calendar.
- **New DB table:** `medication_logs (patient_id, medication_name, dose, taken_at, report_id)`
- **New API:** `POST /api/medications/log`, `GET /api/medications/schedule`
- **New pages:** Medication schedule page with daily tracker

#### 🟡 P2 — Health History Timeline
Visual vertical timeline across all past sessions — "Mar 15: Diagnosed → Mar 17: Blood report analyzed → Apr 1: Follow-up due."
- **Implementation:** Pure frontend — aggregates existing session data into a timeline component
- **New page:** `HealthTimeline.jsx`

#### 🟡 P2 — Symptom Trend Analysis
Compare symptom severity across multiple sessions with a chart: "Fatigue was 8/10 on Mar 1, dropped to 5/10 on Mar 15 after treatment."
- **New API:** `GET /api/patient/symptoms/trends`
- **New page:** Trends chart page using recharts

#### 🟡 P2 — Second Opinion / Re-analyze
Patient can request a fresh AI analysis of the same symptoms to get an alternative differential diagnosis. Stores both results for comparison.
- **Implementation:** Add "Get Second Opinion" button on Results page — re-calls `/api/disease/predict` with same session; stores alternate result in new JSONB column

#### 🟡 P2 — Emergency Contact & Medical ID
Store emergency contact, critical allergies, blood type, organ donor status. Show on a PIN-protected "Medical ID" page accessible without full login.
- **New DB table:** `medical_id (patient_id, emergency_name, emergency_phone, critical_notes, pin_hash)`
- **New API:** `GET/PUT /api/patient/medical-id`; `GET /api/medical-id/:patientId?pin=xxxx`

#### 🟢 P3 — Telemedicine Link Integration
After the doctor referral banner, generate a Jitsi Meet room link and send it to both patient and the nearest available doctor in the DB.
- **New API:** `POST /api/consultations/create` → Jitsi room URL

#### 🟢 P3 — Insurance Information Storage
Store insurance provider, policy number, group number, member ID. Pre-fill these fields on exported PDF medical reports.
- **New DB column:** `insurance_info JSONB` added to `patient_profiles`

---

### Doctor Features

#### 🟠 D1 — Patient Records Viewer
When a patient shares their report (see P1 above), the doctor can view the full analysis inside their dashboard — blood values, diagnosis, treatment plan.
- **New DB table:** `patient_doctor_access (patient_id, doctor_id, session_id, granted_at, revoked_at)`
- **New pages:** "Shared with Me" tab in doctor dashboard

#### 🟠 D2 — Digital Prescription Writer
After the assist agent output, doctor fills a prescription form — drug autocomplete from FDA, dosage/frequency/duration, clinical notes — and exports as a formatted PDF.
- **New DB table:** `prescriptions (doctor_id, patient_case JSONB, medications JSONB, notes TEXT, issued_at)`
- **New API:** `POST /api/doctor-assist/prescriptions`, `GET /api/doctor-assist/prescriptions/:id/pdf`
- **New pages:** Prescription form with FDA drug autocomplete

#### 🟠 D3 — Drug Interaction Quick Checker
Standalone tool — doctor types 2+ drug names and instantly sees RxNorm interaction data. No agent needed; direct tool call.
- **New API:** `GET /api/tools/drug-interactions?drugs=metformin,lisinopril`
- **New UI:** Drug interaction checker widget in doctor dashboard

#### 🟡 D4 — Patient Panel Management
Doctor maintains a list of regular patients. Each linked patient shows a summary card — last visit, active conditions, recent blood report flag.
- **New DB table:** `doctor_patients (doctor_id, patient_id, added_at, notes TEXT)`
- **New API:** `POST/GET /api/doctor-assist/patients`
- **New pages:** "My Patients" panel in doctor dashboard

#### 🟡 D5 — Appointment Scheduling
Patient requests an appointment with a specific doctor. Doctor sees pending requests and can accept/decline with a note and proposed time.
- **New DB table:** `appointments (patient_id, doctor_id, requested_at, scheduled_at, status, notes)`
- **New API:** `POST/GET/PUT /api/appointments`
- **New pages:** Appointment request (patient), appointment management (doctor)

#### 🟡 D6 — Doctor Analytics Dashboard
Stats for the doctor: total patients assisted, most common diagnoses, most frequently missing tests, urgency distribution, weekly/monthly volume.
- **New API:** `GET /api/doctor-assist/analytics` — aggregate queries on `doctor_assist_sessions` JSONB
- **New pages:** Analytics tab with charts

#### 🟡 D7 — Clinical Notes per Session
Doctor adds free-text clinical notes to any assist session — "Patient seen in clinic, confirmed T2D, started Metformin 500mg."
- **New DB column:** `clinical_notes TEXT` added to `doctor_assist_sessions`
- **New API:** `PUT /api/doctor-assist/sessions/:id/notes`
- **New UI:** Inline editable notes field per session card

#### 🟢 D8 — Lab Order Generator
From the missing tests output, auto-generate a formatted lab order slip (patient name, tests requested, ICD code, doctor signature) as a printable PDF.
- **New API:** `GET /api/doctor-assist/sessions/:id/lab-order-pdf`

---

### Platform & Infrastructure

#### 🔴 I1 — Email Notifications
Email patient when blood report analysis is complete. Email doctor when a patient shares a report with them.
- **New service:** `server/services/emailService.js` (Nodemailer + Mailgun/SendGrid free tier)
- **New env vars:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- **Triggers:** After `blood-report/analyze` completes; after `report_shares` is created

#### 🔴 I2 — Password Reset Flow
Forgot password → enter email → receive link → click link → set new password. Standard auth requirement.
- **New DB table:** `password_reset_tokens (user_id, token UNIQUE, expires_at)`
- **New API:** `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- **New pages:** `ForgotPassword.jsx`, `ResetPassword.jsx`

#### 🔴 I3 — Session Expiry UX
When JWT expires (after 7 days), instead of silent 401 errors, show a modal: "Your session has expired — please sign in again." Preserve the current page URL so user returns after login.
- **Implementation:** Axios interceptor in `api.js` — catch 401 → dispatch logout + toast + redirect with `?returnUrl=` param

#### 🟠 I4 — Cloud File Storage (S3 / Cloudinary)
Blood report files are currently saved to local `uploads/` disk. This breaks on any cloud deployment (ephemeral filesystems). Move to AWS S3 or Cloudinary.
- **New service:** `server/services/storageService.js` — `uploadFile(buffer, mimeType)` → returns CDN URL
- **Change:** Replace Multer disk storage with Multer memory storage + S3 upload
- **New env vars:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`

#### 🟠 I5 — Rate Limit Feedback UI
When Groq returns 429, currently handled silently. Show patient/doctor a visible countdown: "AI is busy — retrying in 12 seconds…" in the AgentStatusPanel.
- **Backend:** Emit a `throttled` SSE event with `retryIn` seconds from `agentRunner.js`
- **Frontend:** AgentStatusPanel renders a countdown badge during throttle

#### 🟡 I6 — Admin Panel
A third role (`admin`) can view all users, all sessions, usage statistics, suspend accounts, and browse agent logs across all patients.
- **New DB:** Add `admin` to `users.role` CHECK constraint
- **New routes:** `server/routes/admin.js` — guarded by `role === 'admin'`
- **New pages:** User list, session browser, usage stats dashboard

#### 🟡 I7 — Progressive Web App (PWA)
Make the app installable on mobile. Cache dashboard and recent sessions for offline viewing.
- **Implementation:** `vite-plugin-pwa` added to `vite.config.js`
- **New files:** `public/manifest.json`, service worker config

#### 🟡 I8 — Two-Factor Authentication for Doctors
Doctors set up TOTP 2FA (Google Authenticator). Patient 2FA optional.
- **New DB columns:** `users.totp_secret`, `users.totp_enabled`
- **New API:** `POST /api/auth/2fa/setup`, `POST /api/auth/2fa/verify`
- **New pages:** 2FA setup wizard, 2FA verification step in login

#### 🟡 I9 — HIPAA-aligned Audit Trail
Every data access logged to a tamper-evident audit trail — who viewed which patient's report, when, from which IP.
- **New DB table:** `audit_trail (user_id, action, resource_type, resource_id, ip_address, user_agent, created_at)`
- **New middleware:** `server/middleware/audit.js` — auto-log on protected route access
- **Admin view:** Audit log browser in admin panel

#### 🟢 I10 — Dark Mode
System-preference-aware dark theme with a toggle in the navbar and localStorage persistence.
- **Implementation:** TailwindCSS dark mode (`class` strategy) + `useTheme` hook

---

### AI & Agent Enhancements

#### 🟠 A1 — Clinical Risk Scoring Agent
New agent that calculates validated clinical risk scores directly from blood report values:
- **Framingham Score** — 10-year cardiovascular disease probability
- **FINDRISC** — Type 2 diabetes risk score
- **CKD-EPI** — Kidney function stage (GFR-based)
- **Child-Pugh** — Liver disease severity
- **New DB column:** `blood_reports.risk_scores JSONB`
- **New API:** `POST /api/blood-report/risk-scores`
- **New UI:** "Risk Scores" section on Analysis page with gauge charts

#### 🟠 A2 — Follow-up Recommendation Agent
After analysis, AI recommends when to retest — "Recheck HbA1c in 3 months", "Retest lipid panel in 6 weeks after starting statin."
- **Implementation:** Single-turn Groq call after blood report analysis; input: abnormal findings + tablet plan → output: follow-up schedule JSON
- **New API:** `POST /api/blood-report/follow-up`
- **New UI:** "Follow-up Schedule" card on Analysis page with calendar reminder button

#### 🟡 A3 — Personalized Drug Dosage Calculator
For each recommended tablet, calculate the appropriate dose based on the patient's age, weight, kidney function (creatinine/GFR), and liver function (ALT/AST) from their blood report.
- **Implementation:** Extend `bloodReportAgent.js` Phase 2a — feed kidney/liver values into dosage calculation prompt
- **Output:** Each tablet recommendation gains a `personalized_dose` field

#### 🟡 A4 — Mental Health Screener Agent
After symptom intake, if patient reports fatigue + sleep issues + mood-related symptoms, the AI automatically runs PHQ-9 (depression) and GAD-7 (anxiety) screening questionnaires.
- **New DB column:** `symptom_sessions.mental_health_score JSONB`
- **New API:** `POST /api/disease/mental-health-screen`
- **New UI:** Mental health screening section in Results page

#### 🟡 A5 — Differential Diagnosis Explainer
For each of the top 5 diseases, AI generates a "why this vs the others" explanation — what distinguishing symptoms point to this diagnosis over alternatives.
- **Implementation:** Single-turn call after `diagnosticAgent.js` completes
- **New UI:** "Compare Diagnoses" expandable section on Results page

#### 🟢 A6 — Nutrition & Exercise Agent
After blood report analysis, generate a detailed personalized:
- **Nutrition plan:** Macros breakdown, meal timing, specific foods targeting blood value deficiencies (e.g., iron-rich foods for low ferritin)
- **Exercise plan:** Safe workout types, intensity, duration based on health status and medications
- **Implementation:** New Phase 2c in `bloodReportAgent.js` — separate Groq call for fitness JSON
- **New UI:** "Fitness & Nutrition" tab in Analysis page

---

### Feature Summary Table

| # | Feature | Category | Priority | Effort |
|---|---------|----------|----------|--------|
| 1 | Email Notifications | Platform | 🔴 P0 | Medium |
| 2 | Password Reset | Platform | 🔴 P0 | Low |
| 3 | Session Expiry UX | Platform | 🔴 P0 | Low |
| 4 | PDF Export | Patient | 🔴 P0 | Medium |
| 5 | Vitals Tracker | Patient | 🟠 P1 | Medium |
| 6 | Share Report | Patient | 🟠 P1 | Medium |
| 7 | Risk Scoring Agent | AI | 🟠 P1 | Medium |
| 8 | Follow-up Agent | AI | 🟠 P1 | Low |
| 9 | Patient Records Viewer | Doctor | 🟠 P1 | Medium |
| 10 | Prescription Writer | Doctor | 🟠 P1 | High |
| 11 | Drug Interaction Checker | Doctor | 🟠 P1 | Low |
| 12 | Cloud File Storage (S3) | Platform | 🟠 P1 | Medium |
| 13 | Rate Limit Feedback UI | Platform | 🟠 P1 | Low |
| 14 | Medication Tracker | Patient | 🟡 P2 | Medium |
| 15 | Health History Timeline | Patient | 🟡 P2 | Low |
| 16 | Symptom Trend Analysis | Patient | 🟡 P2 | Medium |
| 17 | Second Opinion | Patient | 🟡 P2 | Low |
| 18 | Emergency / Medical ID | Patient | 🟡 P2 | Medium |
| 19 | Patient Panel Management | Doctor | 🟡 P2 | Medium |
| 20 | Appointment Scheduling | Doctor | 🟡 P2 | High |
| 21 | Doctor Analytics | Doctor | 🟡 P2 | Medium |
| 22 | Clinical Notes | Doctor | 🟡 P2 | Low |
| 23 | Lab Order Generator | Doctor | 🟡 P2 | Low |
| 24 | Admin Panel | Platform | 🟡 P2 | High |
| 25 | PWA Support | Platform | 🟡 P2 | Low |
| 26 | 2FA for Doctors | Platform | 🟡 P2 | Medium |
| 27 | HIPAA Audit Trail | Platform | 🟡 P2 | Medium |
| 28 | Dosage Calculator Agent | AI | 🟡 P2 | Medium |
| 29 | Mental Health Screener | AI | 🟡 P2 | Medium |
| 30 | Differential Explainer | AI | 🟡 P2 | Low |
| 31 | Telemedicine Link | Patient | 🟢 P3 | Low |
| 32 | Insurance Storage | Patient | 🟢 P3 | Low |
| 33 | Dark Mode | Platform | 🟢 P3 | Low |
| 34 | Nutrition & Exercise Agent | AI | 🟢 P3 | Medium |

---

## License

MIT © 2024 — See [LICENSE](LICENSE) for details.

**Medical Disclaimer**: This software is provided for informational and educational purposes only. It does not constitute medical advice. Outputs from AI agents are not reviewed by licensed medical professionals and should not be used to make health decisions. Always consult a qualified healthcare provider.
