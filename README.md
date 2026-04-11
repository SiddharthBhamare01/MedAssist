# MedAssist AI

> **AI-powered medical assistant** — symptom diagnosis, blood report analysis, risk scoring, and doctor assistance powered by autonomous multi-provider AI agents with ensemble consensus.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-316192?logo=postgresql)](https://supabase.com/)
[![Multi-Provider AI](https://img.shields.io/badge/AI-Multi--Provider%20Ensemble-orange)](#ai-providers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

> **Medical Disclaimer**: MedAssist AI is for informational purposes only. It is **not** a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [AI Agents](#ai-agents)
- [AI Providers](#ai-providers)
- [Ensemble Consensus System](#ensemble-consensus-system)
- [Medical Tools](#medical-tools)
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

MedAssist AI is a full-stack medical assistant web application with three user roles:

| Role | What they can do |
|------|-----------------|
| **Patient** | Enter symptoms → get AI disease diagnosis → see recommended blood tests → upload blood report → receive tablet recommendations, diet plan, risk scores, follow-up schedule, and doctor referral guidance |
| **Doctor** | Input patient case → AI identifies missing essential blood tests → write prescriptions → check drug interactions → view shared reports → manage appointments |
| **Admin** | Manage users → view HIPAA audit trail |

The AI backbone uses a **multi-provider ensemble architecture** with automatic fallback across Cerebras, SambaNova, OpenRouter, and GitHub Models. Agents use **tool calling** to run autonomous multi-turn agentic loops over real medical data from free public APIs — OpenFDA, RxNorm (NIH), and NIH ClinicalTables. A **consensus judge** merges outputs from multiple providers for higher-accuracy results.

---

## Features

### Patient
- **Symptom Intake Wizard** — 3-step form: demographics, medical history (tag inputs for conditions/allergies/medications), and 36 symptoms across 7 body systems with severity, duration, and onset
- **AI Diagnostic Agent** — autonomous agent with ICD-10 tool lookups, returns top 5 diseases with confidence scores, descriptions, and ensemble consensus count
- **Ensemble Cross-Verification** — runs diagnosis on all available AI providers in parallel, then a consensus judge merges results for higher accuracy
- **Live Agent Status** — real-time updates show every reasoning step and tool call as the agent executes
- **Recommended Blood Tests** — per-diagnosis test list with reason and urgency level
- **Blood Report Upload** — upload JPG/PNG/PDF; Gemini Vision OCR extracts all lab values with normal ranges and status flags (low/high/critical)
- **Blood Report Analysis** — 3-phase AI pipeline with ensemble consensus generates a full medical analysis dashboard:
  - Summary & root cause assessment
  - Abnormal findings with clinical interpretation
  - Treatment advice
  - FDA-verified tablet recommendations (dosage, frequency, contraindications)
  - Personalized diet plan (foods to eat/avoid, meal schedule)
  - Recovery ingredients with targets
- **Risk Scoring** — composite clinical risk score (0–100) across cardiovascular, diabetes, kidney, and liver dimensions with hospital visit urgency
- **Follow-Up Scheduling** — AI recommends when to recheck abnormal findings (top 3 most urgent)
- **Doctor Finder Map** — interactive Leaflet map with real-time OpenStreetMap Overpass API data, radius/specialty filters, and directions links
- **Health Timeline** — chronological view of all sessions and vitals as events
- **Vitals Tracker** — log blood pressure, glucose, weight, heart rate, SpO2, temperature with trend charts
- **Medications Tracker** — current medications log with active/inactive toggle, auto-populated from AI recommendations
- **Medical ID** — PIN-protected emergency contact & health info, publicly accessible via link
- **Prescriptions** — view doctor-issued digital prescriptions with PDF download
- **Appointments** — request appointments with doctors, track status
- **Report Sharing** — generate 7-day expiry share links for blood reports (no auth required to view)
- **Second Opinion** — re-run diagnostic agent on any past session for a fresh analysis
- **Session Expiry Warning** — modal warns before 7-day JWT expiry

### Doctor
- **Clinic Profile** — specialization, hospital, city, state, phone, availability toggle
- **Doctor Assist Agent** — input patient case + existing tests → AI returns missing essential tests, ICD-10 code, and coverage analysis with fuzzy matching
- **Drug Interaction Checker** — ensemble-powered drug interaction analysis with severity ratings
- **Digital Prescriptions** — write and issue prescriptions to patients
- **Shared Reports** — view blood reports patients have shared
- **Patient Analytics** — aggregate stats and charts across patient panel
- **Appointment Management** — accept/decline patient appointment requests
- **Session History** — full history of past assist sessions with agent step logs

### Admin
- **User Management** — list, search, filter users by role
- **HIPAA Audit Trail** — view all data access logs (user, action, resource, IP, user agent)

### Platform
- **Role-Based Auth** — JWT (7-day), bcrypt password hashing, patient/doctor/admin separation enforced at every route
- **Two-Factor Authentication** — TOTP-based 2FA with QR code setup (speakeasy)
- **Password Reset** — email-based flow with single-use expiry tokens
- **Multi-Provider AI Fallback** — automatic provider switching on rate limits with sibling-aware blocking
- **Ensemble Consensus** — multiple AI providers vote on diagnoses and analyses, judge merges for accuracy
- **Helicone Observability** — all LLM calls traced live at helicone.ai/dashboard when configured
- **Responsive UI** — TailwindCSS with dark/light theme toggle, mobile hamburger nav, print-optimized CSS
- **ARIA Accessibility** — skip-to-content, label/id bindings, aria-busy, role="dialog"
- **Agent Log Viewer** — expandable modal showing every tool call, argument, and result per turn
- **PDF Generation** — downloadable session summaries and prescriptions

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        React 19 Client (Vite)                        │
│                                                                      │
│   Auth  ──►  Patient Intake  ──►  Results  ──►  Upload Report       │
│   2FA        Vitals Tracker       │              │                   │
│              Medications          │         Analysis Dashboard       │
│              Health Timeline      │         Risk Scores · Follow-Up  │
│              Medical ID           │              ▲                    │
│              Prescriptions        │         SSE step stream          │
│                                   │                                  │
│   Doctor Dashboard  ◄────────────┘    Admin: Users · Audit Trail    │
│   Drug Checker · Prescriptions · Analytics · Appointments            │
└──────────────────────────┬───────────────────────┬──────────────────┘
                           │ REST API               │ SSE
┌──────────────────────────▼───────────────────────▼──────────────────┐
│                      Express.js API Server                           │
│                                                                      │
│   /api/auth          /api/patient          /api/disease              │
│   /api/blood-report  /api/doctor-assist    /api/agent                │
│   /api/doctors       /api/appointments     /api/admin                │
│   /api/shared                                                        │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────────────┐
          ▼                ▼                         ▼
┌──────────────┐ ┌──────────────────┐ ┌──────────────────────────────┐
│ diagnostic   │ │ bloodReport      │ │ doctorAssist · riskScoring   │
│ Agent        │ │ Agent            │ │ followUp · ensembleRunner    │
│              │ │                  │ │                              │
│ ICD lookup   │ │ lab ranges       │ │ ICD lookup · lab ranges      │
│              │ │ drug search      │ │ drug search · drug details   │
│              │ │ drug details     │ │ drug interactions            │
│              │ │ drug interactions│ │                              │
└──────┬───────┘ └────────┬────────┘ └──────────────┬───────────────┘
       └──────────────────┼─────────────────────────┘
                          │ shared agentRunner.js
                          │ (MAX_TURNS=6, 500ms delay, provider fallback)
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │              Multi-Provider AI Ensemble               │
   │                                                       │
   │  Cerebras Qwen-235B  ──►  ┐                          │
   │  Cerebras Llama-8B   ──►  │  Consensus   ──►  Final  │
   │  SambaNova Llama-70B ──►  │   Judge            Result │
   │  OpenRouter (Gemma)  ──►  │                          │
   │  GitHub gpt-4o-mini  ──►  ┘                          │
   │                                                       │
   │  Helicone Gateway (observability)                     │
   └──────────────────────┬───────────────────────────────┘
                          │ tool calls
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
   │ NIH         │ │  OpenFDA     │ │  RxNorm      │
   │ ClinicalTab │ │  Drug Search │ │  Drug Inter- │
   │ ICD-10      │ │  + Details   │ │  actions     │
   └─────────────┘ └──────────────┘ └──────────────┘
                          │
          ┌───────────────────────────────┐
          │     PostgreSQL (Supabase)     │
          │                               │
          │  users · patient_profiles     │
          │  doctor_profiles              │
          │  symptom_sessions             │
          │  blood_reports                │
          │  vitals_logs                  │
          │  medication_logs              │
          │  medical_id                   │
          │  prescriptions                │
          │  appointments                 │
          │  doctor_assist_sessions       │
          │  report_shares                │
          │  audit_trail                  │
          │  agent_logs                   │
          └───────────────────────────────┘
```

### Patient Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1 — Symptom Intake Wizard                                  │
│  Demographics → Medical History → 36 Symptoms (7 systems)       │
└─────────────────────────────┬───────────────────────────────────┘
                              │ POST /api/disease/predict
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2 — Diagnostic Agent (Tool Calls + Ensemble Consensus)     │
│  Phase 1: Primary agent with ICD-10 tool lookups                │
│  Phase 2: Ensemble — all providers predict in parallel           │
│  Phase 3: Consensus judge merges into top 5 diseases             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3 — Recommended Blood Tests                                │
│  Per-diagnosis test list with reason and urgency level           │
└─────────────────────────────┬───────────────────────────────────┘
                              │ POST /api/blood-report/upload
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4 — Blood Report OCR (Gemini Vision)                       │
│  Extracts: parameter, value, unit, normal_range, status          │
└─────────────────────────────┬───────────────────────────────────┘
                              │ POST /api/blood-report/analyze
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5 — Blood Report Agent (3-Phase Ensemble Pipeline)         │
│  Phase 1: Tool calls (lab ranges, drug search, drug details)    │
│  Phase 2a: Medical ensemble (summary, findings, tablets)         │
│  Phase 2b: Lifestyle ensemble (diet plan, recovery ingredients)  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 6 — Risk Scoring Agent                                     │
│  Composite score (0-100): cardiovascular, diabetes, kidney,      │
│  liver — with hospital visit urgency recommendation              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 7 — Follow-Up Agent                                        │
│  Top 3 recheck recommendations by clinical urgency               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 8 — Analysis Dashboard                                     │
│  Summary · Findings · Treatment · Tablets · Diet · Recovery      │
│  Risk Scores · Follow-Up Schedule · Share Link                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## AI Agents

### Agent 1 — Diagnostic Agent (`diagnosticAgent.js`)

| | |
|---|---|
| **Input** | Patient demographics + 36-symptom assessment (severity/duration/onset) |
| **Tools** | `lookup_icd_code` — queries NIH ClinicalTables for ICD-10 codes |
| **Phase 1** | Primary agent with tool-calling loop — gathers ICD codes, reasons about top 5 diseases |
| **Phase 2** | Ensemble — all providers predict top 5 diseases in parallel |
| **Phase 3** | Consensus judge merges outputs — adds `consensus_count` and `confidence` fields |
| **Output** | Top 5 differential diagnoses with ICD code, confidence %, description, matched symptoms, consensus count |

### Agent 2 — Blood Report Agent (`bloodReportAgent.js`)

| | |
|---|---|
| **Input** | OCR-extracted blood values, patient profile |
| **Tools** | `get_lab_reference_range`, `search_drug_by_condition`, `get_drug_details`, `check_drug_interactions` |
| **Phase 1** | Autonomous tool calls — gathers lab reference ranges and FDA drug data |
| **Phase 2a** | Medical ensemble — all providers generate: summary, abnormal findings, treatment, tablet recommendations |
| **Phase 2b** | Lifestyle ensemble — all providers generate: diet plan, recovery ingredients |
| **Consensus** | Judge merges each phase: where agents agree use consensus; conflicts default to safer option |
| **Output** | Full medical analysis JSON (summary, findings, tablets, diet, recovery) |

### Agent 3 — Risk Scoring Agent (`riskScoringAgent.js`)

| | |
|---|---|
| **Input** | OCR-extracted blood values, patient profile |
| **Tools** | None (single-turn reasoning) |
| **Scoring** | Evaluates 4 clinical dimensions: cardiovascular (Framingham-based), diabetes (FINDRISC-based), kidney (CKD-EPI-based), liver (Child-Pugh-based) |
| **Output** | Composite score 0–100, risk level (Low/Moderate/High/Critical), hospital visit urgency, per-area breakdown |

### Agent 4 — Follow-Up Agent (`followUpAgent.js`)

| | |
|---|---|
| **Input** | Abnormal findings + current tablet recommendations |
| **Tools** | None (single-turn reasoning) |
| **Logic** | Critical values → 1–2 weeks; significantly abnormal → 1–3 months; mildly abnormal → 3–6 months; new medications → 4–6 weeks |
| **Output** | Top 3 recheck recommendations with test name, timing, reason, and priority (urgent/routine/monitoring) |

### Agent 5 — Doctor Assist Agent (`doctorAssistAgent.js`)

| | |
|---|---|
| **Input** | Patient case (age, gender, chief complaint, symptoms, known conditions) + list of existing tests |
| **Tools** | `lookup_icd_code`, `get_lab_reference_range` |
| **Logic** | Confirms disease via ICD lookup → determines essential tests (max 6) → fuzzy-matches against existing tests → reports gaps |
| **Output** | Missing essential tests with urgency, reference ranges; covered tests; ICD-10 code; `allCovered` boolean |
| **Access** | Doctor role only, rate limited to 10 req/min |

### Shared Agent Runner (`agentRunner.js`)

```
MAX_TURNS            = 6        // Hard limit — prevents runaway API calls
INTER_TURN_DELAY_MS  = 500      // Pause between turns (burst rate limit protection)
MAX_RETRIES          = 2        // Per-provider retry on soft 429
PROVIDER_FALLBACK    = true     // Hard 429 → automatically try next provider
DEFAULT_MAX_TOKENS   = 1500
```

---

## AI Providers

All providers use the OpenAI-compatible `chat.completions` API via the `openai` SDK.

| Priority | Provider | Model | Purpose |
|----------|----------|-------|---------|
| 1 | **Cerebras** | `qwen-3-235b-a22b-instruct-2507` | Primary — best medical reasoning |
| 2 | **Cerebras** | `llama3.1-8b` | Fast secondary ensemble opinion |
| 3 | **SambaNova** | `Meta-Llama-3.3-70B-Instruct` | Free tier, no monthly cap |
| 4 | **OpenRouter** | `openrouter/free` + Gemma-3 fallbacks | Free tier, multiple model fallbacks |
| 5 | **GitHub Models** | `gpt-4o-mini` | PAT-authenticated fallback |

**Fallback behavior:**
- Soft 429 (transient rate limit) → retry with exponential backoff (5s, 10s, max 30s)
- Hard 429 (`x-should-retry: false`) → mark provider + siblings as blocked → switch to next provider
- Cerebras and Cerebras Fast share the same API key — if one is blocked, both are skipped
- Blocked providers are tracked for the server process lifetime

**Observability:** When `HELICONE_API_KEY` is set, all LLM calls route through the Helicone gateway for live traces at helicone.ai/dashboard.

---

## Ensemble Consensus System

The ensemble runner (`ensembleRunner.js`) executes the same prompt on **all available providers in parallel**, then a **consensus judge** (running on the primary provider) merges the outputs into a single higher-accuracy result.

| Task Type | Used By | Merge Logic |
|-----------|---------|-------------|
| `disease_diagnosis` | Diagnostic Agent | 2+ agents agree → 0.8–1.0 confidence; 1 agent only → 0.4–0.6; deduplicate, top 5 |
| `blood_analysis` | Blood Report Agent (medical + lifestyle) | Where agents agree → use consensus; conflicts → safer option; add consensus_note per section |
| `drug_interactions` | Drug Interaction Checker | 2+ agents agree → high confidence; conflicts → MORE SEVERE rating; patient safety first |

**Single-provider fallback:** If only one provider is available, the ensemble step is skipped and the primary output is used directly.

---

## Medical Tools

Five tools available to agents for real-time medical knowledge lookup:

| Tool | API Source | Purpose |
|------|-----------|---------|
| `lookup_icd_code` | NIH ClinicalTables | Find ICD-10-CM codes for diseases |
| `get_lab_reference_range` | Local reference table (40 parameters) | Normal ranges for blood tests, gender-specific variants |
| `search_drug_by_condition` | OpenFDA | Find FDA-approved drugs for conditions |
| `get_drug_details` | OpenFDA | Dosage, warnings, contraindications, adverse reactions |
| `check_drug_interactions` | RxNorm (NIH) | Check interactions between multiple drugs |

**Lab parameters covered (40):** CBC (hemoglobin, hematocrit, WBC, RBC, platelets, MCV, MCHC), glucose/diabetes (glucose, HbA1c, insulin), metabolic panel (sodium, potassium, chloride, bicarbonate, BUN, creatinine, GFR), liver (ALT, AST, bilirubin, alkaline phosphatase, albumin, total protein), lipids (total cholesterol, LDL, HDL, triglycerides), thyroid (TSH, free T3, free T4), minerals/vitamins (calcium, magnesium, phosphorus, vitamin D, vitamin B12, iron, ferritin), inflammation (CRP, ESR), other (uric acid, LDH, INR).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 7, React Router v7, TailwindCSS 3 |
| **UI Components** | react-hot-toast, react-hook-form, Recharts, Framer Motion |
| **Maps** | Leaflet + react-leaflet, OpenStreetMap tiles + Overpass API (no API key) |
| **Backend** | Node.js 18+, Express.js 5 |
| **Database** | PostgreSQL via Supabase (SSL, `rejectUnauthorized: false`) |
| **Authentication** | jsonwebtoken (JWT, 7-day), bcrypt, speakeasy (TOTP 2FA) |
| **Primary AI** | Multi-provider ensemble: Cerebras, SambaNova, OpenRouter, GitHub Models |
| **AI SDK** | OpenAI SDK (`openai` package) — all providers are OpenAI-compatible |
| **Vision OCR** | Google Gemini API — `gemini-1.5-flash` |
| **Observability** | Helicone gateway — live LLM call traces |
| **File Upload** | Multer — JPEG/PNG/PDF, max 10MB |
| **PDF Generation** | PDFKit — session summaries, prescriptions |
| **Email** | Nodemailer — password reset, notifications |
| **Real-time** | Server-Sent Events (SSE) — live agent step streaming |
| **Medical APIs** | OpenFDA, RxNorm (NIH), NIH ClinicalTables, OpenStreetMap Overpass |
| **Testing** | Plain Node.js `http` — integration tests, zero external dependencies |

---

## Project Structure

```
medassist/
├── client/                              # React 19 + Vite frontend
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx                      # Route definitions + layout wrapper
│       ├── main.jsx                     # React entry point
│       ├── index.css                    # Tailwind directives, print CSS, animations
│       ├── context/
│       │   └── AuthContext.jsx          # JWT auth state (localStorage persistence)
│       ├── services/
│       │   └── api.js                   # Axios instance with auto Bearer token
│       ├── components/
│       │   ├── Layout/
│       │   │   └── Navbar.jsx           # Role-based nav links + mobile hamburger + theme toggle
│       │   ├── PrivateRoute.jsx         # Route guard + role enforcement
│       │   ├── ErrorBoundary.jsx        # Error fallback UI
│       │   ├── SessionExpiryModal.jsx   # JWT expiry warning modal
│       │   ├── ShareModal.jsx           # Generate + copy share link
│       │   ├── AgentLogModal.jsx        # Full agent log viewer (ARIA dialog)
│       │   └── AgentStatus/
│       │       └── AgentStatusPanel.jsx # Real-time agent step display
│       ├── hooks/
│       │   ├── useAgentStatus.js        # SSE hook (EventSource lifecycle)
│       │   └── useTheme.js              # Light/dark theme toggle
│       └── pages/
│           ├── Auth/
│           │   ├── Login.jsx
│           │   ├── Register.jsx
│           │   ├── ForgotPassword.jsx
│           │   └── ResetPassword.jsx
│           ├── Patient/
│           │   ├── PatientDashboard.jsx # Home dashboard with session list
│           │   ├── Intake.jsx           # 3-step symptom wizard
│           │   ├── Results.jsx          # Diagnostic results (top 5 diseases + consensus)
│           │   ├── Tests.jsx            # Recommended blood tests
│           │   ├── UploadReport.jsx     # OCR upload + extracted values preview
│           │   ├── Analysis.jsx         # Full analysis dashboard (6 sections + risk + follow-up)
│           │   ├── Doctors.jsx          # Leaflet map + doctor list + filters
│           │   ├── Vitals.jsx           # Vitals tracker with trend charts
│           │   ├── Medications.jsx      # Medication log with active toggle
│           │   ├── HealthTimeline.jsx   # Chronological session + vitals events
│           │   ├── MedicalID.jsx        # Emergency contact + PIN setup
│           │   └── Prescriptions.jsx    # View + download doctor prescriptions
│           ├── Doctor/
│           │   ├── Dashboard.jsx        # Patient list + stats
│           │   ├── Assist.jsx           # Case input form + missing tests results
│           │   ├── DrugChecker.jsx      # Drug interaction checker (ensemble)
│           │   ├── Prescriptions.jsx    # Write digital prescriptions
│           │   ├── SharedReports.jsx    # Reports shared by patients
│           │   └── Analytics.jsx        # Patient analytics + charts
│           ├── Admin/
│           │   ├── AdminDashboard.jsx   # User management
│           │   └── AuditLog.jsx         # HIPAA audit trail viewer
│           ├── Appointments.jsx         # Shared appointment management (patient + doctor)
│           └── Shared/
│               ├── SharedReport.jsx     # Public shared report (no auth)
│               └── PublicMedicalID.jsx  # Public medical ID with PIN (no auth)
│
└── server/                              # Express.js 5 backend
    ├── index.js                         # App entry — mounts all routes + rate limiting
    ├── package.json
    ├── db/
    │   ├── pool.js                      # Supabase pool (SSL enabled)
    │   ├── schema.sql                   # Full database schema
    │   ├── seed.sql                     # Demo data
    │   └── migrations/                  # Incremental schema changes
    │       ├── 001_recommended_tests_jsonb.sql
    │       ├── 002_session_status.sql
    │       └── 003_all_features.sql     # Medications, vitals, medical ID, prescriptions, etc.
    ├── middleware/
    │   ├── auth.js                      # verifyToken — JWT middleware
    │   ├── upload.js                    # Multer config (file type + size limits)
    │   └── audit.js                     # HIPAA audit logging
    ├── models/
    │   ├── User.js                      # findByEmail, createUser
    │   ├── patientQueries.js            # Patient profile + session queries
    │   └── doctorQueries.js             # Doctor profile + assist session queries
    ├── routes/
    │   ├── auth.js                      # POST /register, /login, /forgot-password, /reset-password, /2fa
    │   ├── patient.js                   # Profiles, sessions, vitals, medications, medical ID, timeline
    │   ├── disease.js                   # POST /predict, /predict/retry
    │   ├── bloodReport.js               # POST /upload, /analyze, /risk-scores, /follow-up
    │   ├── doctors.js                   # GET /nearby (Overpass API + DB fallback)
    │   ├── doctorAssist.js              # POST /suggest-tests, /drug-interactions; profiles; sessions
    │   ├── appointments.js              # POST /request, /accept, /decline; GET /list
    │   ├── admin.js                     # GET /users, /audit-log (admin only)
    │   ├── shared.js                    # GET /report/:token, /medical-id/:patientId (public)
    │   └── agentStatus.js               # GET /stream/:sessionId (SSE)
    ├── agents/
    │   ├── agentRunner.js               # Shared agentic loop with provider fallback
    │   ├── diagnosticAgent.js           # Symptom → differential diagnosis + ensemble
    │   ├── bloodReportAgent.js          # Blood values → full medical analysis + ensemble
    │   ├── riskScoringAgent.js          # Blood values → composite risk score (0-100)
    │   ├── followUpAgent.js             # Abnormal findings → recheck schedule (top 3)
    │   ├── doctorAssistAgent.js         # Patient case → missing tests
    │   ├── ensembleRunner.js            # Multi-provider parallel execution + consensus judge
    │   └── tools/
    │       └── medicalTools.js          # 5 tool definitions + API request handlers
    ├── services/
    │   ├── geminiService.js             # Gemini Vision OCR — structured lab values
    │   ├── locationService.js           # Haversine distance calculation
    │   ├── osmService.js                # OpenStreetMap Overpass API (3 mirrors, cache)
    │   ├── emailService.js              # SMTP email sending (Nodemailer)
    │   └── pdfService.js                # PDF generation (PDFKit)
    ├── utils/
    │   ├── aiClients.js                 # Multi-provider registry + Helicone gateway
    │   └── eventEmitter.js              # Per-session EventEmitter Map (for SSE)
    └── tests/
        └── integration.js               # Integration test suite
```

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** — or a free [Supabase](https://supabase.com/) project
- **At least one AI provider key** — Cerebras, SambaNova, OpenRouter, or GitHub PAT (all free)
- **Gemini API key** — [aistudio.google.com](https://aistudio.google.com/) (free tier, for blood report OCR)

### 1. Clone

```bash
git clone https://github.com/your-username/medassist-ai.git
cd medassist-ai/medassist
```

### 2. Apply Database Schema

```bash
psql $DATABASE_URL < server/db/schema.sql
psql $DATABASE_URL < server/db/migrations/003_all_features.sql
```

Or paste the contents into the Supabase SQL editor.

### 3. Install Dependencies

```bash
# Backend
cd server && npm install

# Frontend
cd ../client && npm install
```

### 4. Configure Environment

```bash
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

# ── Multi-provider AI (set at least ONE; first found in priority order becomes primary) ──

# Cerebras — cloud.cerebras.ai → API Keys (free, no monthly cap, RPM limited)
CEREBRAS_API_KEY=csk-...

# SambaNova — cloud.sambanova.ai → API (free, no monthly cap)
SAMBANOVA_API_KEY=...

# OpenRouter — openrouter.ai → Keys (free :free models)
OPENROUTER_API_KEY=sk-or-v1-...

# GitHub Models — github.com/settings/tokens → Fine-grained → Models: Read
GITHUB_TOKEN=ghp_...

# Optional: comma-separated provider names to exclude
EXCLUDED_AI_PROVIDERS=

# Helicone observability — helicone.ai (optional, enables live LLM traces)
HELICONE_API_KEY=sk-helicone-...

# Google Gemini API — blood report OCR only
GEMINI_API_KEY=AIza...

# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

> **Provider priority**: Cerebras → SambaNova → OpenRouter → GitHub. The first key found becomes the primary provider. On hard rate limits, the system automatically falls back to the next available provider.

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
| `POST` | `/api/auth/forgot-password` | `{ email }` | `{ message }` |
| `POST` | `/api/auth/reset-password` | `{ token, newPassword }` | `{ message }` |

`role` must be `"patient"`, `"doctor"`, or `"admin"`.

### Patient

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/patient/profile` | Patient | Get patient profile |
| `PUT` | `/api/patient/profile` | Patient | Create or update patient profile |
| `GET` | `/api/patient/sessions` | Patient | List recent symptom sessions |
| `POST` | `/api/patient/sessions/:id/second-opinion` | Patient | Re-run diagnostic agent |
| `GET/POST` | `/api/patient/vitals` | Patient | Get or log vitals (BP, glucose, weight, etc.) |
| `GET/POST` | `/api/patient/medications` | Patient | Get or add medication log entries |
| `GET/PUT` | `/api/patient/medical-id` | Patient | Get or update emergency medical ID |
| `GET` | `/api/patient/timeline` | Patient | Health timeline (sessions + vitals as events) |
| `GET` | `/api/patient/prescriptions` | Patient | List prescriptions from doctors |

### Disease Diagnosis

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/disease/predict` | Patient | Run diagnostic agent + ensemble consensus |
| `POST` | `/api/disease/predict/retry/:sessionId` | Patient | Retry a stale pending session |
| `POST` | `/api/disease/tests` | Patient | Get recommended blood tests for a disease |

### Blood Report

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/blood-report/upload` | Patient | Upload image/PDF, run Gemini OCR. Returns `{ reportId, extractedValues }` |
| `POST` | `/api/blood-report/analyze` | Patient | Run blood report agent (3-phase ensemble). Returns full analysis |
| `POST` | `/api/blood-report/risk-scores` | Patient | Run risk scoring agent. Returns composite score + breakdown |
| `POST` | `/api/blood-report/follow-up` | Patient | Run follow-up agent. Returns top 3 recheck recommendations |
| `GET` | `/api/blood-report/:id` | Patient | Fetch saved report + cached analysis |

### Doctor Assist

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/doctor-assist/suggest-tests` | Doctor | Run doctor assist agent (10 req/min limit) |
| `GET` | `/api/doctor-assist/drug-interactions` | Doctor | Ensemble-powered drug interaction check |
| `GET` | `/api/doctor-assist/sessions` | Doctor | Last 10 assist sessions |
| `GET/PUT` | `/api/doctor-assist/profile` | Doctor | Get or update clinic profile |

### Doctors (Nearby)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/doctors/nearby` | Patient | Query: `?lat=&lng=&radius=&specialty=` — real-time Overpass API + DB fallback |

### Appointments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/appointments/request` | Patient | Request an appointment |
| `POST` | `/api/appointments/accept/:id` | Doctor | Accept appointment |
| `POST` | `/api/appointments/decline/:id` | Doctor | Decline appointment |
| `GET` | `/api/appointments/list` | Both | List appointments for current user |

### Shared (Public — No Auth)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/shared/report/:token` | None | View shared blood report (7-day expiry token) |
| `GET` | `/api/shared/medical-id/:patientId` | None | View medical ID (requires PIN) |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/admin/users` | Admin | List/search/filter users |
| `GET` | `/api/admin/audit-log` | Admin | HIPAA audit trail |

### Agent Status (SSE)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/agent/stream/:sessionId` | Patient | EventSource — streams `step`, `done`, `error` events |

---

## Database Schema

```sql
-- Authentication & roles
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
  two_factor_secret TEXT,
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
  id                SERIAL PRIMARY KEY,
  patient_id        INT REFERENCES users(id),
  symptoms          JSONB,
  profile_snapshot  JSONB,
  predicted_diseases JSONB,
  selected_disease  TEXT,
  recommended_tests JSONB,
  report_id         INT,
  status            TEXT DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Blood reports
CREATE TABLE blood_reports (
  id                      SERIAL PRIMARY KEY,
  session_id              INT,
  patient_id              INT REFERENCES users(id),
  image_path              TEXT,
  extracted_values        JSONB,
  analysis                JSONB,
  tablet_recommendations  JSONB,
  risk_scores             JSONB,
  follow_up               JSONB,
  complexity_flag         BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Vitals tracking
CREATE TABLE vitals_logs (
  id              SERIAL PRIMARY KEY,
  patient_id      INT REFERENCES users(id),
  blood_pressure  TEXT,
  glucose         NUMERIC,
  weight_kg       NUMERIC,
  heart_rate      INT,
  spo2            NUMERIC,
  temperature     NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Medication tracking
CREATE TABLE medication_logs (
  id              SERIAL PRIMARY KEY,
  patient_id      INT REFERENCES users(id),
  medication_name TEXT,
  dose            TEXT,
  report_id       INT,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Emergency medical ID
CREATE TABLE medical_id (
  id                SERIAL PRIMARY KEY,
  patient_id        INT REFERENCES users(id) UNIQUE,
  emergency_contact TEXT,
  emergency_phone   TEXT,
  organ_donor       BOOLEAN DEFAULT FALSE,
  pin               TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor profiles
CREATE TABLE doctor_profiles (
  id              SERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id) ON DELETE CASCADE,
  specialization  TEXT,
  hospital_name   TEXT,
  city            TEXT,
  state           TEXT,
  latitude        NUMERIC,
  longitude       NUMERIC,
  phone           TEXT,
  available       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Digital prescriptions
CREATE TABLE prescriptions (
  id          SERIAL PRIMARY KEY,
  doctor_id   INT REFERENCES users(id),
  patient_id  INT REFERENCES users(id),
  medications JSONB,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments
CREATE TABLE appointments (
  id          SERIAL PRIMARY KEY,
  patient_id  INT REFERENCES users(id),
  doctor_id   INT REFERENCES users(id),
  reason      TEXT,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','completed')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Report sharing (7-day expiry tokens)
CREATE TABLE report_shares (
  id         SERIAL PRIMARY KEY,
  report_id  INT REFERENCES blood_reports(id),
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor assist sessions
CREATE TABLE doctor_assist_sessions (
  id           SERIAL PRIMARY KEY,
  doctor_id    INT REFERENCES users(id),
  patient_case JSONB,
  suggestions  JSONB,
  steps        JSONB,
  turns        INT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- HIPAA audit trail
CREATE TABLE audit_trail (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,
  resource   TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

Integration tests run against the live API using plain Node.js `http` — no test framework needed.

```bash
cd medassist/server
node tests/integration.js
```

---

## Free APIs Used

| API | Purpose | Limit |
|-----|---------|-------|
| [Cerebras](https://cloud.cerebras.ai/) | Primary LLM inference (Qwen-235B) | RPM limited, no monthly cap |
| [SambaNova](https://cloud.sambanova.ai/) | LLM inference (Llama-3.3-70B) | Free, no monthly cap |
| [OpenRouter](https://openrouter.ai/) | LLM inference (free models) | Free :free models |
| [GitHub Models](https://github.com/marketplace/models) | LLM inference (gpt-4o-mini) | Free with PAT |
| [Google Gemini](https://ai.google.dev/) | Vision OCR for blood report images | 15 req/min free |
| [OpenFDA](https://open.fda.gov/apis/) | Drug search by condition + drug details | 240 req/min (no key) |
| [RxNorm API — NIH](https://rxnav.nlm.nih.gov/) | Drug interaction checking | No hard limit |
| [NIH ClinicalTables](https://clinicaltables.nlm.nih.gov/) | ICD-10 code lookup | No hard limit |
| [OpenStreetMap Overpass](https://overpass-api.de/) | Nearby healthcare providers (3 mirrors) | Fair use |
| [Helicone](https://helicone.ai/) | LLM observability & tracing | Free tier |

All external APIs are called server-side only. No API keys are exposed to the frontend.

---

## License

MIT &copy; 2024 — See [LICENSE](LICENSE) for details.

**Medical Disclaimer**: This software is provided for informational and educational purposes only. It does not constitute medical advice. Outputs from AI agents are not reviewed by licensed medical professionals and should not be used to make health decisions.
