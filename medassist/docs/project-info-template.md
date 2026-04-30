# CS 595 — Medical Informatics & AI  
# Project Information Template

**Project Title:** MedAssist AI — Autonomous Medical Informatics Assistant  
**Team Member:** Siddharth Bhamare  
**Course:** CS 595 — Medical Informatics & AI  
**Submission Date:** April 2026  
**GitHub:** https://github.com/SiddharthBhamare01/MedAssist

---

## 1. LOF (Lines of Focus) Pillar

**Primary Pillar: Patient Engagement**

MedAssist AI directly improves patient engagement by:
- Empowering patients to understand their own blood test results through plain-language AI explanations
- Providing personalized health risk scores (kidney, liver, cardiovascular) derived from their actual lab values
- Delivering actionable follow-up schedules so patients know exactly when to retest
- Enabling symptom-to-diagnosis exploration with ICD-10-verified differential diagnoses
- Giving patients a visual, gauge-based view of exactly where each parameter sits relative to normal

**Secondary Pillar: Clinical Decision Support**

MedAssist AI also supports clinicians by:
- Automatically detecting missing essential diagnostic tests from a patient case description
- Cross-checking existing orders against standard-of-care blood test panels for the presenting complaint
- Surfacing drug interactions via RxNorm API before a prescription is finalized

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     React 19 Client (Vite + Tailwind)                │
│  Patient Flow: Intake → Results → Upload → Analysis → Doctor Map    │
│  Doctor Flow:  Dashboard → Assist Agent → Log Viewer                │
└──────────────────────┬────────────────────────┬──────────────────────┘
                       │ REST API                │ SSE (live agent steps)
┌──────────────────────▼────────────────────────▼──────────────────────┐
│                       Express.js API (Node 18)                       │
│  /api/auth  /api/patient  /api/disease  /api/blood-report            │
│  /api/doctor-assist  /api/doctors  /api/agent  /api/appointments     │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────────┐
          ▼                  ▼                       ▼
  Diagnostic Agent    Blood Report Agent    Doctor Assist Agent
  (ICD-10 tools)      (FDA + RxNorm tools)  (ICD + lab range tools)
          └──────────────────┼──────────────────────┘
                             ▼ shared agentRunner.js
             ┌───────────────────────────────────┐
             │   Multi-Provider AI Ensemble       │
             │  Groq · Cerebras · SambaNova ──►  │
             │  OpenRouter · GitHub Models    │  │
             │              ▼ Consensus Judge    │
             └───────────────────────────────────┘
                             │ tool calls
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   NIH ClinicalTables   OpenFDA API       RxNorm (NIH)
   (ICD-10 lookup)      (drug search)     (interactions)
                             │
                             ▼
                  PostgreSQL (Supabase)
                  7 tables: users, patient_profiles,
                  symptom_sessions, blood_reports,
                  doctor_profiles, doctor_assist_sessions,
                  agent_logs
```

---

## 3. Functional Requirements

### Patient Role
| # | Requirement | Status |
|---|-------------|--------|
| FR-01 | Register and login with JWT authentication | ✅ Implemented |
| FR-02 | Complete 3-step symptom intake wizard (demographics, history, 36 symptoms) | ✅ Implemented |
| FR-03 | Receive top-5 differential diagnoses with ICD-10 codes and probabilities | ✅ Implemented |
| FR-04 | View recommended blood tests per diagnosis with urgency levels | ✅ Implemented |
| FR-05 | Upload blood report (PDF/JPG/PNG) and extract all lab values via OCR | ✅ Implemented |
| FR-06 | Receive full AI analysis: summary, abnormal findings, treatment plan, medications | ✅ Implemented |
| FR-07 | View composite health risk scores (kidney, liver, cardiovascular) | ✅ Implemented |
| FR-08 | Receive personalized follow-up test schedule | ✅ Implemented |
| FR-09 | Find nearby doctors on an interactive map with filtering | ✅ Implemented |
| FR-10 | Chat with AI about blood report results | ✅ Implemented |
| FR-11 | View abnormal parameters as visual gauge cards | ✅ Implemented |
| FR-12 | Export analysis as PDF summary card | ✅ Implemented |

### Doctor Role
| # | Requirement | Status |
|---|-------------|--------|
| FR-13 | Doctor registration and login | ✅ Implemented |
| FR-14 | Enter patient case and existing ordered tests | ✅ Implemented |
| FR-15 | Receive AI-suggested missing diagnostic tests with urgency ratings | ✅ Implemented |
| FR-16 | View session history with agent audit trail | ✅ Implemented |
| FR-17 | Check drug interactions for a prescription | ✅ Implemented |
| FR-18 | View shared patient reports | ✅ Implemented |

### System
| # | Requirement | Status |
|---|-------------|--------|
| FR-19 | Live agent status streaming via Server-Sent Events | ✅ Implemented |
| FR-20 | Multi-provider AI ensemble with automatic failover | ✅ Implemented |
| FR-21 | All agent runs logged to audit trail table | ✅ Implemented |
| FR-22 | Role-based access control (patient/doctor endpoints isolated) | ✅ Implemented |
| FR-23 | Rate limiting on all AI-calling endpoints | ✅ Implemented |
| FR-24 | English + Spanish translation (i18next) | ✅ Implemented |

---

## 4. User Stories

### Patient Stories

**US-01 — Symptom Diagnosis**  
*As a patient, I want to enter my symptoms so that I can see a list of possible diagnoses with their likelihood before I visit a doctor.*

Acceptance criteria:
- The form captures symptom name, severity (1–10), duration (days), and onset (sudden/gradual)
- Results show at least 3 diseases with ICD-10 codes and probability percentages
- Agent executes in under 60 seconds

**US-02 — Blood Report Understanding**  
*As a patient, I want to upload my lab report PDF so that I can understand what each abnormal value means and what I should do.*

Acceptance criteria:
- Upload accepts PDF and image files up to 10 MB
- All numerical parameters are extracted with units, reference ranges, and status flags
- Summary explains root cause in plain language
- Critical values trigger an immediate physician consultation alert

**US-03 — Health Risk Awareness**  
*As a patient, I want to see my organ health risk scores so that I understand my overall health status across different body systems.*

Acceptance criteria:
- Scores displayed for kidney, liver, and cardiovascular
- Each score has a plain-language explanation of what drives it
- Composite score and risk level (low/moderate/high/critical) clearly visible

**US-04 — Medication Safety**  
*As a patient, I want to see potential drug interactions between my existing medications and any newly suggested ones.*

Acceptance criteria:
- Existing medications entered during intake are checked against new suggestions
- Interactions flagged with severity and clinical note

**US-05 — Finding Care**  
*As a patient, I want to find doctors and clinics near me on a map so that I can schedule an appointment.*

Acceptance criteria:
- Map auto-detects location (browser GPS or IP fallback)
- Doctors shown with specialty, distance, phone, and directions link
- Filterable by specialty; radius adjustable (2–50 miles)

### Doctor Stories

**US-06 — Missing Test Detection**  
*As a doctor, I want to describe a patient case and see which essential diagnostic tests I may have missed.*

Acceptance criteria:
- Input accepts free-text chief complaint, symptoms, known conditions
- Existing tests can be checked off from a standard panel list
- Output shows only tests NOT already ordered, with clinical reasoning and urgency

**US-07 — Drug Interaction Check**  
*As a doctor, I want to check a patient's medication list for interactions before finalizing a prescription.*

Acceptance criteria:
- RxNorm API used for interaction lookup
- Results show interaction severity (minor/moderate/major) and clinical note

**US-08 — Session Audit Trail**  
*As a doctor, I want to view the full AI reasoning steps for any past session so I can verify and document the clinical basis for AI suggestions.*

Acceptance criteria:
- Each session shows all tool calls: input parameters, API responses, reasoning steps
- Timestamps and agent name shown per log entry

---

## 5. Sprint History (15-Day Build Plan)

| Sprint | Days | Focus | Key Deliverables |
|--------|------|-------|-----------------|
| 1 | 1–2 | Foundation | Full-stack scaffold, DB schema (7 tables), JWT auth with role-based routing |
| 2 | 3–4 | Core Patient | 3-step symptom wizard, Diagnostic Agent with ICD-10 tool calls (Groq) |
| 3 | 5–6 | Results & Upload | Disease results page with SSE live updates, blood report upload with PDF/OCR |
| 4 | 7–8 | Blood Report AI | Blood Report Agent (FDA + RxNorm tools), full analysis dashboard (5 sections) |
| 5 | 9–10 | Doctor Features | Leaflet doctor finder map (OpenStreetMap), Doctor Assist Agent |
| 6 | 11–12 | Quality | Agent log viewer, error boundaries, full UI polish, mobile responsive, i18n |
| 7 | 13–15 | Finalization | 25-test integration suite, documentation, demo prep |

---

## 6. AI Tools & Technologies Used

### AI Models
| Model | Provider | Purpose |
|-------|----------|---------|
| llama-3.3-70b-versatile | Groq | Primary AI for all agents (fast inference, free) |
| Qwen3-235B-A22B | Cerebras | Ensemble provider — diagnostic accuracy |
| Llama-3.1-70B | Cerebras | Ensemble provider — fallback |
| Llama-3.1-70B | SambaNova | Ensemble provider — fallback |
| Gemma-2-9B | OpenRouter | Ensemble provider — lightweight |
| GPT-4o-mini | GitHub Models | Ensemble provider — consensus judge |
| gemini-1.5-flash | Google Gemini | Blood report PDF/image OCR |

### Ensemble Consensus Architecture
The system runs diagnosis prompts across all configured providers in parallel, then calls a consensus judge to:
- Identify diseases/tests appearing in 2+ provider outputs (higher confidence)
- Resolve conflicts by taking the clinically safer value (lower drug doses, higher severity)
- Return a single merged result with `consensus_count` per finding

### External Medical APIs (all free, no key required)
| API | Use Case |
|-----|----------|
| NIH ClinicalTables | ICD-10 code lookup and validation |
| OpenFDA | Drug search by condition, dosage, contraindications |
| RxNorm (NIH) | Drug interaction checking |
| OpenStreetMap / Overpass | Real-time doctor/clinic/hospital geosearch |

### AI Frameworks & Tools
- **OpenAI-compatible SDK**: All providers accessed via `openai` npm package (chat completions API)
- **Tool calling**: All agents use structured function definitions for deterministic API calls
- **Helicone**: Optional LLM observability gateway (traces, costs, latency)
- **i18next**: English/Spanish translation with AI-batch translation for dynamic content

---

## 7. Database Schema Summary

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Auth (patient + doctor) | id, email, password_hash, role, full_name |
| `patient_profiles` | Health demographics | user_id, age, gender, weight_kg, height_cm, existing_conditions[], allergies[], current_medications[] |
| `symptom_sessions` | Diagnostic sessions | patient_id, symptoms JSONB, predicted_diseases JSONB, recommended_tests JSONB |
| `blood_reports` | Upload + analysis | patient_id, extracted_values JSONB, analysis JSONB, tablet_recommendations JSONB, risk_scores JSONB, follow_up JSONB |
| `doctor_profiles` | Doctor directory | user_id, specialization, hospital_name, latitude, longitude |
| `doctor_assist_sessions` | Doctor AI sessions | doctor_id, patient_case JSONB, suggestions JSONB, agent_log_id |
| `agent_logs` | Audit trail | session_id, agent_name, steps JSONB, total_turns, created_at |

---

## 8. Key Design Decisions

**Why multi-provider ensemble instead of single model?**  
Medical AI must be accurate. A single model can hallucinate. By running the same prompt on 5 providers and using a consensus judge, we achieve higher accuracy — similar to how doctors seek second opinions. Diseases appearing in 2+ outputs receive higher confidence scores.

**Why tool calling instead of pure LLM generation?**  
ICD-10 codes, drug names, and interaction data are factual — they must come from authoritative sources (NIH, FDA), not from LLM training data which can be stale or incorrect. Tool calling forces the agent to look up real data rather than guess.

**Why Groq instead of Gemini for agents?**  
Gemini free-tier quota was exhausted in the deployment region. Groq provides equivalent capability with no monthly cap and faster inference. Gemini is retained for Vision OCR (PDF/image extraction) only.

**Why SSE instead of polling?**  
Server-Sent Events give the user immediate feedback as each agent step completes (ICD lookup, FDA search, etc.). This makes a 30-second agent run feel transparent and trustworthy — the user sees the AI actually working, not just a spinner.

---

## 9. Educational Disclaimers

MedAssist AI is an **educational CS 595 project**. It is not a licensed medical device and must not be used for actual clinical decisions. All AI outputs include explicit disclaimers. The system:
- Never prescribes medications (only suggests educational information)
- Flags complex cases for physician consultation
- Labels all AI-generated content as educational, not medical advice
- System prompts explicitly state: *"Educational use only — not a substitute for professional medical advice"*
