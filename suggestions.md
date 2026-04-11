# MedAssist AI — Enterprise Feature Suggestions

> Planned enhancements to grow MedAssist AI from a course project into a production-grade healthcare platform. Grouped by category and prioritized.

---

## Priority Levels

| Symbol | Meaning |
|--------|---------|
| 🔴 **P0** | Critical — implement first |
| 🟠 **P1** | High value — implement next |
| 🟡 **P2** | Medium value — planned |
| 🟢 **P3** | Nice to have |

---

## Patient Features

#### ✅ ~~P0 — PDF Medical Summary Export~~
One-click export of a full diagnostic session as a printable PDF — includes diagnosis, test list, analysis results, tablet plan, and diet plan. Patient takes this to their real doctor.
- **Backend:** `pdfkit` or `puppeteer` server-side rendering
- **New API:** `GET /api/patient/sessions/:id/export-pdf`
- **New UI:** "Export as PDF" button on Analysis page

#### ✅ ~~P1 — Health Vitals Tracker~~
Let patients log daily vitals — blood pressure, glucose, weight, heart rate, SpO2, temperature — and view trend charts over time.
- **New DB table:** `vitals_logs (patient_id, type, value, unit, recorded_at)`
- **New API:** `POST /api/vitals`, `GET /api/vitals?type=glucose&days=30`
- **New pages:** Vitals entry form, line-chart dashboard (recharts)
- **AI integration:** Feed last 30 days of vitals into diagnostic agent context

#### ✅ ~~P1 — Share Report with Doctor~~
Patient generates a secure, expiring token link to share their analysis with any doctor — even one not on the platform.
- **New DB table:** `report_shares (token, report_id, patient_id, expires_at, accessed_at)`
- **New API:** `POST /api/patient/sessions/:id/share` → token; `GET /api/shared/:token` → read-only view
- **New pages:** Shared report viewer (public, no auth required)

#### ✅ ~~P2 — Medication Tracker & Reminders~~
After receiving tablet recommendations, patient marks medications as active, logs daily doses taken, and sees a medication calendar.
- **New DB table:** `medication_logs (patient_id, medication_name, dose, taken_at, report_id)`
- **New API:** `POST /api/medications/log`, `GET /api/medications/schedule`
- **New pages:** Medication schedule page with daily tracker

#### ✅ ~~P2 — Health History Timeline~~
Visual vertical timeline across all past sessions — "Mar 15: Diagnosed → Mar 17: Blood report analyzed → Apr 1: Follow-up due."
- **Implementation:** Pure frontend — aggregates existing session data into a timeline component
- **New page:** `HealthTimeline.jsx`

#### ✅ ~~P2 — Symptom Trend Analysis~~
Compare symptom severity across multiple sessions with a chart: "Fatigue was 8/10 on Mar 1, dropped to 5/10 on Mar 15 after treatment."
- **New API:** `GET /api/patient/symptoms/trends`
- **New page:** Trends chart page using recharts

#### ✅ ~~P2 — Second Opinion / Re-analyze~~
Patient can request a fresh AI analysis of the same symptoms to get an alternative differential diagnosis. Stores both results for comparison.
- **Implementation:** Add "Get Second Opinion" button on Results page — re-calls `/api/disease/predict` with same session; stores alternate result in new JSONB column

#### ✅ ~~P2 — Emergency Contact & Medical ID~~
Store emergency contact, critical allergies, blood type, organ donor status. Show on a PIN-protected "Medical ID" page accessible without full login.
- **New DB table:** `medical_id (patient_id, emergency_name, emergency_phone, critical_notes, pin_hash)`
- **New API:** `GET/PUT /api/patient/medical-id`; `GET /api/medical-id/:patientId?pin=xxxx`

#### P3 — Telemedicine Link Integration
After the doctor referral banner, generate a Jitsi Meet room link and send it to both patient and the nearest available doctor in the DB.
- **New API:** `POST /api/consultations/create` → Jitsi room URL
- **Status:** Not yet implemented

#### P3 — Insurance Information Storage
Store insurance provider, policy number, group number, member ID. Pre-fill these fields on exported PDF medical reports.
- **New DB column:** `insurance_info JSONB` added to `patient_profiles` (column exists, UI pending)
- **Status:** DB column created, no UI or business logic yet

---

## Doctor Features

#### ✅ ~~D1 — Patient Records Viewer~~
When a patient shares their report (see P1 above), the doctor can view the full analysis inside their dashboard — blood values, diagnosis, treatment plan.
- **New DB table:** `patient_doctor_access (patient_id, doctor_id, session_id, granted_at, revoked_at)`
- **New pages:** "Shared with Me" tab in doctor dashboard

#### ✅ ~~D2 — Digital Prescription Writer~~
After the assist agent output, doctor fills a prescription form — drug autocomplete from FDA, dosage/frequency/duration, clinical notes — and exports as a formatted PDF.
- **New DB table:** `prescriptions (doctor_id, patient_case JSONB, medications JSONB, notes TEXT, issued_at)`
- **New API:** `POST /api/doctor-assist/prescriptions`, `GET /api/doctor-assist/prescriptions/:id/pdf`
- **New pages:** Prescription form with FDA drug autocomplete

#### ✅ ~~D3 — Drug Interaction Quick Checker~~
Standalone tool — doctor types 2+ drug names and instantly sees RxNorm interaction data. No agent needed; direct tool call.
- **New API:** `GET /api/tools/drug-interactions?drugs=metformin,lisinopril`
- **New UI:** Drug interaction checker widget in doctor dashboard

#### ✅ ~~D4 — Patient Panel Management~~
Doctor maintains a list of regular patients. Each linked patient shows a summary card — last visit, active conditions, recent blood report flag.
- **New DB table:** `doctor_patients (doctor_id, patient_id, added_at, notes TEXT)`
- **New API:** `POST/GET /api/doctor-assist/patients`
- **New pages:** "My Patients" panel in doctor dashboard

#### ✅ ~~D5 — Appointment Scheduling~~
Patient requests an appointment with a specific doctor. Doctor sees pending requests and can accept/decline with a note and proposed time.
- **New DB table:** `appointments (patient_id, doctor_id, requested_at, scheduled_at, status, notes)`
- **New API:** `POST/GET/PUT /api/appointments`
- **New pages:** Appointment request (patient), appointment management (doctor)

#### ✅ ~~D6 — Doctor Analytics Dashboard~~
Stats for the doctor: total patients assisted, most common diagnoses, most frequently missing tests, urgency distribution, weekly/monthly volume.
- **New API:** `GET /api/doctor-assist/analytics` — aggregate queries on `doctor_assist_sessions` JSONB
- **New pages:** Analytics tab with charts

#### ✅ ~~D7 — Clinical Notes per Session~~
Doctor adds free-text clinical notes to any assist session — "Patient seen in clinic, confirmed T2D, started Metformin 500mg."
- **New DB column:** `clinical_notes TEXT` added to `doctor_assist_sessions`
- **New API:** `PUT /api/doctor-assist/sessions/:id/notes`
- **New UI:** Inline editable notes field per session card

#### D8 — Lab Order Generator
From the missing tests output, auto-generate a formatted lab order slip (patient name, tests requested, ICD code, doctor signature) as a printable PDF.
- **New API:** `GET /api/doctor-assist/sessions/:id/lab-order-pdf`
- **Status:** Not yet implemented (prescription PDF exists, but lab order is separate)

---

## Platform & Infrastructure

#### ✅ ~~I1 — Email Notifications~~
Email patient when blood report analysis is complete. Email doctor when a patient shares a report with them.
- **New service:** `server/services/emailService.js` (Nodemailer + Mailgun/SendGrid free tier)
- **New env vars:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- **Triggers:** After `blood-report/analyze` completes; after `report_shares` is created

#### ✅ ~~I2 — Password Reset Flow~~
Forgot password → enter email → receive link → click link → set new password. Standard auth requirement.
- **New DB table:** `password_reset_tokens (user_id, token UNIQUE, expires_at)`
- **New API:** `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- **New pages:** `ForgotPassword.jsx`, `ResetPassword.jsx`

#### ✅ ~~I3 — Session Expiry UX~~
When JWT expires (after 7 days), instead of silent 401 errors, show a modal: "Your session has expired — please sign in again." Preserve the current page URL so user returns after login.
- **Implementation:** Axios interceptor in `api.js` — catch 401 → dispatch logout + toast + redirect with `?returnUrl=` param

#### ⏸️ I4 — Cloud File Storage (S3 / Cloudinary) — DEFERRED
Blood report files are currently saved to local `uploads/` disk. This breaks on any cloud deployment (ephemeral filesystems). Move to AWS S3 or Cloudinary.
- **New service:** `server/services/storageService.js` — `uploadFile(buffer, mimeType)` → returns CDN URL
- **Change:** Replace Multer disk storage with Multer memory storage + S3 upload
- **New env vars:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`

#### ✅ ~~I5 — Rate Limit Feedback UI~~
When Groq returns 429, currently handled silently. Show patient/doctor a visible countdown: "AI is busy — retrying in 12 seconds..." in the AgentStatusPanel.
- **Backend:** Emit a `throttled` SSE event with `retryIn` seconds from `agentRunner.js`
- **Frontend:** AgentStatusPanel renders a countdown badge during throttle

#### ✅ ~~I6 — Admin Panel~~
A third role (`admin`) can view all users, all sessions, usage statistics, suspend accounts, and browse agent logs across all patients.
- **New DB:** Add `admin` to `users.role` CHECK constraint
- **New routes:** `server/routes/admin.js` — guarded by `role === 'admin'`
- **New pages:** User list, session browser, usage stats dashboard

#### I7 — Progressive Web App (PWA)
Make the app installable on mobile. Cache dashboard and recent sessions for offline viewing.
- **Implementation:** `vite-plugin-pwa` added to `vite.config.js`
- **New files:** `public/manifest.json`, service worker config
- **Status:** Not yet implemented

#### ✅ ~~I8 — Two-Factor Authentication for Doctors~~
Doctors set up TOTP 2FA (Google Authenticator). Patient 2FA optional.
- **New DB columns:** `users.totp_secret`, `users.totp_enabled`
- **New API:** `POST /api/auth/2fa/setup`, `POST /api/auth/2fa/verify`
- **New pages:** 2FA setup wizard, 2FA verification step in login

#### ✅ ~~I9 — HIPAA-aligned Audit Trail~~
Every data access logged to a tamper-evident audit trail — who viewed which patient's report, when, from which IP.
- **New DB table:** `audit_trail (user_id, action, resource_type, resource_id, ip_address, user_agent, created_at)`
- **New middleware:** `server/middleware/audit.js` — auto-log on protected route access
- **Admin view:** Audit log browser in admin panel

#### ✅ ~~I10 — Dark Mode~~
System-preference-aware dark theme with a toggle in the navbar and localStorage persistence.
- **Implementation:** TailwindCSS dark mode (`class` strategy) + `useTheme` hook

---

## AI & Agent Enhancements

#### ✅ ~~A1 — Clinical Risk Scoring Agent~~
New agent that calculates validated clinical risk scores directly from blood report values:
- **Framingham Score** — 10-year cardiovascular disease probability
- **FINDRISC** — Type 2 diabetes risk score
- **CKD-EPI** — Kidney function stage (GFR-based)
- **Child-Pugh** — Liver disease severity
- **New DB column:** `blood_reports.risk_scores JSONB`
- **New API:** `POST /api/blood-report/risk-scores`
- **New UI:** "Risk Scores" section on Analysis page with gauge charts

#### ✅ ~~A2 — Follow-up Recommendation Agent~~
After analysis, AI recommends when to retest — "Recheck HbA1c in 3 months", "Retest lipid panel in 6 weeks after starting statin."
- **Implementation:** Single-turn Groq call after blood report analysis; input: abnormal findings + tablet plan → output: follow-up schedule JSON
- **New API:** `POST /api/blood-report/follow-up`
- **New UI:** "Follow-up Schedule" card on Analysis page with calendar reminder button

#### ✅ ~~A3 — Personalized Drug Dosage Calculator~~
For each recommended tablet, calculate the appropriate dose based on the patient's age, weight, kidney function (creatinine/GFR), and liver function (ALT/AST) from their blood report.
- **Implementation:** Extend `bloodReportAgent.js` Phase 2a — feed kidney/liver values into dosage calculation prompt
- **Output:** Each tablet recommendation gains a `personalized_dose` field

#### A4 — Mental Health Screener Agent
After symptom intake, if patient reports fatigue + sleep issues + mood-related symptoms, the AI automatically runs PHQ-9 (depression) and GAD-7 (anxiety) screening questionnaires.
- **New DB column:** `symptom_sessions.mental_health_score JSONB`
- **New API:** `POST /api/disease/mental-health-screen`
- **New UI:** Mental health screening section in Results page
- **Status:** Not yet implemented

#### A5 — Differential Diagnosis Explainer
For each of the top 5 diseases, AI generates a "why this vs the others" explanation — what distinguishing symptoms point to this diagnosis over alternatives.
- **Implementation:** Single-turn call after `diagnosticAgent.js` completes
- **New UI:** "Compare Diagnoses" expandable section on Results page
- **Status:** Not yet implemented

#### A6 — Nutrition & Exercise Agent
After blood report analysis, generate a detailed personalized:
- **Nutrition plan:** Macros breakdown, meal timing, specific foods targeting blood value deficiencies (e.g., iron-rich foods for low ferritin)
- **Exercise plan:** Safe workout types, intensity, duration based on health status and medications
- **Implementation:** New Phase 2c in `bloodReportAgent.js` — separate Groq call for fitness JSON
- **New UI:** "Fitness & Nutrition" tab in Analysis page
- **Status:** Nutrition/diet exists in Phase 2b; exercise plan not yet implemented

---

## Feature Summary Table

| # | Feature | Category | Priority | Status |
|---|---------|----------|----------|--------|
| 1 | Email Notifications | Platform | 🔴 P0 | ✅ Done |
| 2 | Password Reset | Platform | 🔴 P0 | ✅ Done |
| 3 | Session Expiry UX | Platform | 🔴 P0 | ✅ Done |
| 4 | PDF Export | Patient | 🔴 P0 | ✅ Done |
| 5 | Vitals Tracker | Patient | 🟠 P1 | ✅ Done |
| 6 | Share Report | Patient | 🟠 P1 | ✅ Done |
| 7 | Risk Scoring Agent | AI | 🟠 P1 | ✅ Done |
| 8 | Follow-up Agent | AI | 🟠 P1 | ✅ Done |
| 9 | Patient Records Viewer | Doctor | 🟠 P1 | ✅ Done |
| 10 | Prescription Writer | Doctor | 🟠 P1 | ✅ Done |
| 11 | Drug Interaction Checker | Doctor | 🟠 P1 | ✅ Done |
| 12 | Cloud File Storage (S3) | Platform | 🟠 P1 | ⏸️ Deferred |
| 13 | Rate Limit Feedback UI | Platform | 🟠 P1 | ✅ Done |
| 14 | Medication Tracker | Patient | 🟡 P2 | ✅ Done |
| 15 | Health History Timeline | Patient | 🟡 P2 | ✅ Done |
| 16 | Symptom Trend Analysis | Patient | 🟡 P2 | ✅ Done |
| 17 | Second Opinion | Patient | 🟡 P2 | ✅ Done |
| 18 | Emergency / Medical ID | Patient | 🟡 P2 | ✅ Done |
| 19 | Patient Panel Management | Doctor | 🟡 P2 | ✅ Done |
| 20 | Appointment Scheduling | Doctor | 🟡 P2 | ✅ Done |
| 21 | Doctor Analytics | Doctor | 🟡 P2 | ✅ Done |
| 22 | Clinical Notes | Doctor | 🟡 P2 | ✅ Done |
| 23 | Lab Order Generator | Doctor | 🟡 P2 | 🔲 Pending |
| 24 | Admin Panel | Platform | 🟡 P2 | ✅ Done |
| 25 | PWA Support | Platform | 🟡 P2 | 🔲 Pending |
| 26 | 2FA for Doctors | Platform | 🟡 P2 | ✅ Done |
| 27 | HIPAA Audit Trail | Platform | 🟡 P2 | ✅ Done |
| 28 | Dosage Calculator Agent | AI | 🟡 P2 | ✅ Done (prompt-based) |
| 29 | Mental Health Screener | AI | 🟡 P2 | 🔲 Pending |
| 30 | Differential Explainer | AI | 🟡 P2 | 🔲 Pending |
| 31 | Telemedicine Link | Patient | 🟢 P3 | 🔲 Pending |
| 32 | Insurance Storage | Patient | 🟢 P3 | 🔲 DB only |
| 33 | Dark Mode | Platform | 🟢 P3 | ✅ Done |
| 34 | Nutrition & Exercise Agent | AI | 🟢 P3 | ⚠️ Nutrition only |
| | | | | |
| **N1** | **Symptom Chatbot** | **AI** | **🔴 P0** | **🔲 New** |
| **N2** | **Session Comparison** | **Patient** | **🟠 P1** | **🔲 New** |
| **N3** | **AI SOAP Notes** | **Doctor** | **🟠 P1** | **🔲 New** |
| **N4** | **Voice-to-Symptom** | **Patient** | **🟠 P1** | **🔲 New** |
| **N5** | **Multilingual Support** | **Platform** | **🟡 P2** | **🔲 New** |
| **N6** | **ICD-10 Explorer** | **AI** | **🟡 P2** | **🔲 New** |
| **N7** | **Wearable Device Mock** | **Patient** | **🟡 P2** | **🔲 New** |
| **N8** | **FHIR Export** | **Platform** | **🟡 P2** | **🔲 New** |

**28/34 features fully implemented. 6 features pending (A4, A5, A6-exercise, D8, I7, P3-Telemedicine). #12 (AWS S3) deferred.**

---

## New Feature Suggestions (Phase 2)

> Features to add beyond the original 34 — focused on making the project stand out in a CS 595 demo.

---

### N1 — Symptom Checker Chatbot (🔴 P0 — Demo Showstopper)
Conversational AI interface where patients describe symptoms in natural language. The AI asks follow-up questions ("Where is the pain? How long?"), then auto-feeds structured data into the existing diagnostic agent.
- **Why impressive:** Live demo of a doctor-patient conversation AI — the most visually striking feature for any audience
- **Implementation:** New chat UI page with streaming responses; backend uses Groq to extract structured symptoms from conversation; feeds into existing `runDiagnosticAgent()`
- **New page:** `client/src/pages/Patient/SymptomChat.jsx`
- **New API:** `POST /api/disease/chat` (streaming), `POST /api/disease/chat/finalize` → triggers diagnostic agent
- **New DB column:** `symptom_sessions.chat_history JSONB`

### N2 — Session Comparison Dashboard (🟠 P1)
When a patient has 2+ completed sessions, show side-by-side comparison: blood values across sessions, symptom severity trends, medication changes, risk score progression.
- **Why impressive:** Shows longitudinal patient care — a key Medical Informatics concept
- **Implementation:** Pure frontend — fetches 2 sessions + their blood reports, renders diff table + trend charts
- **New page:** `client/src/pages/Patient/SessionCompare.jsx`
- **New API:** `GET /api/patient/sessions/compare?ids=uuid1,uuid2`

### N3 — AI Clinical Notes (SOAP Format) for Doctors (🟠 P1)
After a doctor reviews a shared patient report, one-click "Generate SOAP Note" produces a structured clinical note (Subjective, Objective, Assessment, Plan) from the patient's data.
- **Why impressive:** SOAP notes are the gold standard in clinical documentation — demonstrates real medical workflow knowledge
- **Implementation:** Single-turn AI call; input = patient symptoms + blood values + analysis; output = structured SOAP JSON
- **New API:** `POST /api/doctor-assist/generate-soap`
- **New DB column:** `doctor_assist_sessions.soap_notes JSONB`
- **New UI:** SOAP note card in doctor's shared report view with copy/export

### N4 — Voice-to-Symptom Input (🟠 P1)
Patient speaks symptoms aloud → browser speech-to-text → AI extracts structured symptoms → feeds into diagnostic agent. Accessibility-first feature.
- **Why impressive:** Accessibility + AI + speech recognition — triple demo impact
- **Implementation:** Browser `SpeechRecognition` API (no backend needed for STT); Groq call to parse transcript into structured symptoms
- **New UI:** Microphone button on Intake page + SymptomChat page

### N5 — Multilingual Support (🟡 P2)
AI generates diagnosis, analysis, and recommendations in the patient's preferred language (Hindi, Spanish, etc.). Toggle in navbar.
- **Why impressive:** Health equity / accessibility — major Medical Informatics theme
- **Implementation:** Add `language` preference to user profile; pass to all AI prompts as "Respond in {language}"
- **New DB column:** `users.preferred_language VARCHAR(10) DEFAULT 'en'`

### N6 — ICD-10 Code Explorer (🟡 P2)
Interactive searchable tree of ICD-10 codes. Patient clicks a diagnosis → sees parent/child codes, related conditions, and prevalence data.
- **Why impressive:** Shows deep Medical Informatics knowledge (ICD-10 is a core topic)
- **Implementation:** Frontend tree component; backend proxies NIH ClinicalTables API (already used by diagnostic agent)
- **New page:** `client/src/pages/Shared/ICD10Explorer.jsx`
- **New API:** `GET /api/tools/icd10/search?q=diabetes` + `GET /api/tools/icd10/:code/related`

### N7 — Wearable Device Integration Mock (🟡 P2)
Simulated smartwatch data feed — heart rate, steps, sleep hours — auto-populates vitals tracker. In demo, use a "Simulate Wearable" button that generates realistic data.
- **Why impressive:** IoT + healthcare integration — forward-looking Medical Informatics
- **Implementation:** Frontend simulation page generates random vitals every 5 seconds and POSTs to existing `/api/patient/vitals` endpoint
- **New page:** `client/src/pages/Patient/WearableSync.jsx`

### N8 — Export to FHIR Format (🟡 P2)
Export patient data as a FHIR R4 Bundle (JSON). Demonstrates healthcare interoperability — the #1 buzzword in Medical Informatics.
- **Why impressive:** FHIR is THE standard for health data exchange — instant credibility in a Medical Informatics course
- **Implementation:** Backend maps session + blood report + medications to FHIR resources (Patient, Condition, Observation, MedicationStatement)
- **New API:** `GET /api/patient/sessions/:id/export-fhir`
- **Output:** Downloadable FHIR R4 Bundle JSON

---

### New Feature Priority Matrix

| # | Feature | Impact | Effort | Demo Wow Factor |
|---|---------|--------|--------|-----------------|
| N1 | Symptom Chatbot | Very High | Medium | ⭐⭐⭐⭐⭐ |
| N2 | Session Comparison | High | Low | ⭐⭐⭐ |
| N3 | AI SOAP Notes | High | Low | ⭐⭐⭐⭐ |
| N4 | Voice Input | High | Low | ⭐⭐⭐⭐⭐ |
| N5 | Multilingual | Medium | Low | ⭐⭐⭐ |
| N6 | ICD-10 Explorer | Medium | Medium | ⭐⭐⭐⭐ |
| N7 | Wearable Mock | Medium | Low | ⭐⭐⭐⭐ |
| N8 | FHIR Export | High | Medium | ⭐⭐⭐⭐⭐ |

**Recommended demo build order:** N1 → N4 → N3 → N8 → N6 → N2 → N7 → N5
