# MedAssist AI — 15-Day TODO Checklist

> Track your daily progress here. Check off each task as you complete it.
> Start: March 7, 2026 | Deadline: March 21, 2026

---

## DAY 1 — Project Scaffold & Database Setup
> Goal: Running skeleton with DB connected

- [x] Create `medassist/` root folder structure
- [x] Init `server/` with `npm init` + install all dependencies
- [x] Init `client/` with Vite + React
- [x] Install client dependencies (react-router-dom, axios, react-hook-form, react-hot-toast, leaflet)
- [x] Set up Tailwind CSS + PostCSS
- [x] Create `server/db/schema.sql` (all 7 tables)
- [x] Create `server/db/seed.sql` (2 patients, 2 doctors, 5 doctor profiles)
- [x] Create `server/db/pool.js` (pg Pool)
- [x] Create `server/index.js` (Express app, all routes stubbed)
- [x] Create all 6 route stub files
- [x] Create `AuthContext.jsx`, `PrivateRoute.jsx`, `Navbar.jsx`
- [x] Create `App.jsx` with full routing (all 10 pages)
- [x] Create all 10 placeholder page files
- [x] Create `.env`, `.env.example`, `.gitignore`
- [x] Create `docker-compose.yml`
- [x] Start Docker Desktop + run `docker compose up -d` (used Supabase instead)
- [x] Run schema + seed: verify all 7 tables exist in DB (Users in DB: 7 confirmed)
- [x] Add AI API key to `server/.env` (switched to Groq — Gemini free tier unavailable in region. SUCCESS confirmed)
- [x] Verify: `node index.js` → server starts on port 5000
- [x] Verify: `vite build` → client builds with 0 errors

---

## DAY 2 — Authentication System
> Goal: Full working login/register with JWT and role-based redirect

**Backend**
- [ ] `server/controllers/authController.js` — `register()` function (hash password, insert user + profile, return JWT)
- [ ] `server/controllers/authController.js` — `login()` function (verify email/password, return JWT)
- [ ] `server/middleware/auth.js` — JWT verification middleware (`req.user`)
- [ ] `server/routes/auth.js` — wire up POST `/register` and POST `/login`
- [ ] `server/models/queries.js` — `createUser()`, `findUserByEmail()`, `createPatientProfile()`, `createDoctorProfile()`
- [ ] Test register (patient) with Postman → verify JWT returned
- [ ] Test register (doctor) with Postman → verify doctor profile saved
- [ ] Test login with wrong password → verify 401 returned

**Frontend**
- [ ] `client/src/pages/Auth/Register.jsx` — full form: name, email, password, role toggle (Patient/Doctor), doctor-only fields (specialization, hospital, city)
- [ ] `client/src/pages/Auth/Login.jsx` — email + password form
- [ ] `client/src/services/authService.js` — `register()`, `login()` API calls
- [ ] Update `AuthContext.jsx` — store `{ token, userId, role, name }` on login
- [ ] Update Axios interceptor in `api.js` — attach `Authorization: Bearer <token>` header
- [ ] `PrivateRoute.jsx` — redirect to `/login` if no token or wrong role
- [ ] Login redirects: patient → `/patient/intake`, doctor → `/doctor/dashboard`
- [ ] Logout clears auth state and redirects to `/login`
- [ ] Form validation with inline error messages
- [ ] Test: register → login → redirect works for both roles

---

## DAY 3 — Patient Profile + Symptom Intake Wizard
> Goal: 3-step form saves profile and collects symptoms

**Backend**
- [ ] `server/routes/patient.js` — PUT `/api/patient/profile`, GET `/api/patient/profile`
- [ ] `server/controllers/patientController.js` — `upsertProfile()`, `getProfile()`
- [ ] `server/models/queries.js` — `upsertPatientProfile()`, `getPatientProfile()`
- [ ] Test: PUT `/api/patient/profile` with JWT → saves to DB

**Frontend**
- [ ] `client/src/pages/Patient/Intake.jsx` — 3-step wizard using `react-hook-form`:
  - [ ] **Step 1**: Age, gender, weight (kg), height (cm), blood group
  - [ ] **Step 2**: Existing conditions (multi-checkbox), allergies (tag input), current medications (tag input), smoking status, alcohol use
  - [ ] **Step 3**: Symptoms organized by body system (7 categories, 30+ symptoms). Each selected symptom: duration, severity slider (1–10), onset radio
- [ ] Progress bar showing current step (1/3, 2/3, 3/3)
- [ ] Validation on each step before allowing Next
- [ ] Step 1+2 data saved to profile via PUT `/api/patient/profile`
- [ ] Step 3 submit calls POST `/api/disease/predict` (returns stub for now)
- [ ] Loading spinner on submit
- [ ] Navigate to `/patient/results` after submit

---

## DAY 4 — Gemini Service + Diagnostic Agent
> Goal: Real Gemini agentic loop running with ICD code tool calls

**Backend**
- [ ] `server/agents/tools/medicalTools.js` — all 5 tool definitions (Gemini `functionDeclarations` format)
- [ ] `server/agents/tools/medicalTools.js` — implement `lookupIcdCode()` (NIH ClinicalTables API)
- [ ] `server/agents/tools/medicalTools.js` — implement `getReferenceRange()` (local hardcoded table, 40 parameters)
- [ ] `server/agents/tools/medicalTools.js` — implement `searchDrugByCondition()` (OpenFDA API)
- [ ] `server/agents/tools/medicalTools.js` — implement `checkDrugInteractions()` (RxNorm API)
- [ ] `server/agents/tools/medicalTools.js` — implement `getDrugDetails()` (OpenFDA API)
- [ ] `server/agents/agentRunner.js` — shared Gemini agentic loop (multi-turn, MAX_TURNS=10)
- [ ] `server/utils/eventEmitter.js` — session-scoped EventEmitter map for SSE
- [ ] `server/agents/diagnosticAgent.js` — Diagnostic Agent using `agentRunner.js`
- [ ] `server/controllers/diseaseController.js` — wire `runDiagnosticAgent()` into route
- [ ] `server/models/queries.js` — `createSymptomSession()`, `updateSessionDiseases()`
- [ ] `server/routes/disease.js` — POST `/api/disease/predict` (real, not stub)
- [ ] Test: POST `/api/disease/predict` with sample symptoms → Gemini calls ICD tool → returns 5 diseases with ICD codes
- [ ] Verify `agent_logs` table populated with tool call steps

---

## DAY 5 — Disease Results Page + Agent Status SSE UI
> Goal: Patient watches live agent steps then sees disease cards

**Backend**
- [ ] `server/routes/agentStatus.js` — SSE endpoint `GET /api/agent/status/:sessionId`
- [ ] Agent emits step events to session EventEmitter during tool calls
- [ ] `server/services/geminiService.js` — `getRecommendedBloodTests(disease, patientProfile)` (single-turn Gemini call)
- [ ] `server/routes/disease.js` — POST `/api/disease/tests`
- [ ] `server/models/queries.js` — `updateSessionTests(sessionId, tests)`

**Frontend**
- [ ] `client/src/hooks/useAgentStatus.js` — custom hook using `EventSource` for SSE subscription
- [ ] `client/src/components/AgentStatus/AgentStatusPanel.jsx` — live step tracker UI (spinner → checkmark per step)
- [ ] `client/src/pages/Patient/Results.jsx`:
  - [ ] Show `AgentStatusPanel` while agent runs
  - [ ] Display top 5 disease cards after agent completes
  - [ ] Each card: disease name, ICD code, probability bar (color-coded), description, matched symptoms
  - [ ] Radio select one disease
  - [ ] "Get Blood Tests" button → POST `/api/disease/tests` → navigate to `/patient/tests`

---

## DAY 6 — Blood Tests Page + Upload UI + Gemini Vision OCR
> Goal: Blood tests displayed, image upload works, OCR extracts values

**Backend**
- [ ] `server/middleware/upload.js` — Multer config (accept JPG/PNG/PDF, max 10MB, save to `uploads/`)
- [ ] `server/services/geminiService.js` — `extractBloodValuesFromImage(base64, mimeType)` (Gemini Vision)
- [ ] `server/routes/bloodReport.js` — POST `/api/blood-report/upload` (stub: save file + OCR only, return extracted values)
- [ ] Test: upload a blood report image → Gemini Vision extracts values as JSON array

**Frontend**
- [ ] `client/src/pages/Patient/Tests.jsx`:
  - [ ] Display recommended tests as cards (test name, reason, normal range)
  - [ ] Print-friendly CSS (`@media print`)
  - [ ] "Upload My Blood Report" button → navigate to `/patient/upload-report`
- [ ] `client/src/pages/Patient/UploadReport.jsx`:
  - [ ] Drag-and-drop zone (accept JPG, PNG, PDF)
  - [ ] Image preview after drop/select
  - [ ] Upload progress bar
  - [ ] "Analyze Report" button → POST multipart to `/api/blood-report/upload`
  - [ ] Loading state: "Our AI is analyzing your report..."

---

## DAY 7 — Blood Report Agent (Most Complex)
> Goal: Full agentic loop with OpenFDA + RxNorm tool calls + medication plan

**Backend**
- [ ] `server/agents/bloodReportAgent.js` — Blood Report Agent with full agentic loop:
  - [ ] Calls `get_lab_reference_range` for every extracted blood value
  - [ ] Calls `search_drug_by_condition` for FDA-approved drugs
  - [ ] Calls `get_drug_details` for contraindication check
  - [ ] Calls `check_drug_interactions` if patient has existing medications
  - [ ] Sets `doctor_referral_needed=true` if 3+ critical values / drug interaction / age>70
- [ ] Update `POST /api/blood-report/upload` controller — run full Blood Report Agent after OCR
- [ ] `server/models/queries.js` — `saveBloodReport()`, `getBloodReport()`
- [ ] Test: upload blood report → verify agent calls FDA API → returns medication plan with `fda_approved: true`
- [ ] Test: patient with existing meds → verify interaction check runs
- [ ] Verify `agent_logs` has all tool call steps for this agent

---

## DAY 8 — Blood Report Analysis Page
> Goal: Full analysis displayed with all 5 sections

**Frontend**
- [ ] `client/src/pages/Patient/Analysis.jsx` — 5 sections:
  - [ ] **Section 1 — Summary**: overall assessment, root cause, complexity badge (Low/Medium/High)
  - [ ] **Section 2 — Abnormal Findings Table**: Parameter | Your Value | Normal Range | Status | Interpretation (color-coded rows)
  - [ ] **Section 3 — Treatment Solutions**: bulleted list
  - [ ] **Section 4 — Tablet Recommendations**: card per tablet (name, generic, dosage, frequency, duration, FDA badge, contraindication badge)
  - [ ] **Section 5 — Doctor Referral** (conditional): alert banner + referral reason + "Find Doctor" button
- [ ] Show `AgentStatusPanel` during loading
- [ ] Navigate to `/patient/doctors` from referral section

---

## DAY 9 — Doctor Finder Map
> Goal: Geolocation + Leaflet map + doctor list + filter

**Backend**
- [ ] `server/services/locationService.js` — Haversine distance formula
- [ ] `server/routes/doctors.js` — GET `/api/doctors/nearby?lat=&lng=&specialty=`
- [ ] Test: call endpoint with Phoenix, AZ coordinates → returns 5 seeded doctors sorted by distance

**Frontend**
- [ ] `client/src/pages/Patient/Doctors.jsx`:
  - [ ] Request `navigator.geolocation` from browser
  - [ ] Fetch `/api/doctors/nearby`
  - [ ] Leaflet map centered on user with doctor markers
  - [ ] Sidebar list: name, specialization, hospital, distance, phone
  - [ ] Click marker → popup with doctor info
  - [ ] Specialization filter dropdown
  - [ ] "Get Directions" link (OpenStreetMap)

---

## DAY 10 — Doctor Dashboard + Doctor Assist Agent
> Goal: Doctor login works, dashboard shows history, Assist Agent running

**Backend**
- [ ] `server/agents/doctorAssistAgent.js` — Doctor Assist Agent:
  - [ ] Calls `lookup_icd_code` to confirm clinical context
  - [ ] Calls `get_lab_reference_range` to enumerate standard tests for condition
  - [ ] Compares against existing prescription → flags gaps
  - [ ] Returns `[{ test_name, reason, urgency: 'routine'|'urgent'|'critical' }]`
- [ ] `server/routes/doctorAssist.js` — POST `/api/doctor-assist/suggest-tests`
- [ ] `server/routes/doctorAssist.js` — GET `/api/doctor-assist/sessions`
- [ ] `server/models/queries.js` — `saveDoctorAssistSession()`, `getDoctorAssistHistory(doctorId)`
- [ ] Test: submit patient case → agent suggests missing tests with urgency levels

**Frontend**
- [ ] `client/src/pages/Doctor/Dashboard.jsx`:
  - [ ] Welcome header with doctor name + specialization
  - [ ] Recent sessions list (last 5)
  - [ ] "New Patient Assist" button
- [ ] `client/src/pages/Doctor/Assist.jsx`:
  - [ ] Left panel: patient info form (age, gender, weight, height, chief complaint, symptoms, duration, known conditions)
  - [ ] Right panel: existing prescription (multi-select common tests + free text)
  - [ ] "Get AI Suggestions" button
  - [ ] `AgentStatusPanel` while running
  - [ ] Results table: Test Name | Reason | Urgency badge
  - [ ] "Copy to Clipboard" button

---

## DAY 11 — Agent Log Viewer + Error Handling
> Goal: Agent audit trail visible in UI, all errors handled gracefully

**Backend**
- [ ] `server/routes/agentStatus.js` — GET `/api/agent/logs/:sessionId`
- [ ] `agentRunner.js` — fallback to direct Gemini call (no tools) if MAX_TURNS exceeded
- [ ] All controllers — wrap in try/catch, return proper HTTP status codes
- [ ] Handle OpenFDA 404 / RxNorm empty results → return `{ note: 'Data unavailable' }` instead of crashing
- [ ] `express-rate-limit` active on all agent routes (verify it works)

**Frontend**
- [ ] Doctor Dashboard — "View Agent Log" button per session → modal showing:
  - [ ] Each tool call: tool name, input params, output summary, timestamp
  - [ ] Total reasoning turns count
- [ ] Add `react-hot-toast` notifications to all API calls (success + error)
- [ ] Add Error Boundary component wrapping each page
- [ ] Axios interceptor — toast on 500 / network failures

---

## DAY 12 — Full UI Polish
> Goal: Responsive, accessible, professional-looking UI

- [ ] Color audit: primary blue `#1A73E8`, white backgrounds, gray cards consistent throughout
- [ ] Mobile responsive: test all pages at 375px, 768px, 1280px
- [ ] All forms: validate on blur + on submit, inline error messages
- [ ] All API calls: loading spinner or skeleton shown
- [ ] Empty states: meaningful messages when no data
- [ ] Disclaimer banner visible on every protected page
- [ ] ARIA labels on all inputs, buttons, modals
- [ ] Tab order correct on all forms
- [ ] Print CSS working on `/patient/tests` page
- [ ] Favicon + `<title>` tags set on all pages
- [ ] Remove any leftover placeholder "Coming Day X" text

---

## DAY 13 — End-to-End Integration Testing
> Goal: Both complete flows work without errors

**Patient Flow**
- [ ] Register new patient account
- [ ] Fill 3-step intake form (use realistic symptoms: fatigue + increased thirst + weight loss)
- [ ] Watch Diagnostic Agent live steps → verify 5 diseases returned with ICD codes
- [ ] Select disease → view blood test list → test print view
- [ ] Upload a sample blood report image
- [ ] Watch Blood Report Agent → verify FDA drug search + interaction check in agent steps
- [ ] View analysis: abnormal table, personalized tablet recommendations
- [ ] Trigger doctor referral (upload report with many abnormal values)
- [ ] Navigate to doctor finder → verify map + 5 doctors shown

**Doctor Flow**
- [ ] Register doctor account
- [ ] Login → see dashboard
- [ ] Enter patient case + existing tests → run Doctor Assist Agent
- [ ] Verify missing tests returned with urgency badges
- [ ] Open agent log modal → verify tool call steps visible

**Database**
- [ ] Verify all sessions saved to `symptom_sessions`, `blood_reports`, `doctor_assist_sessions`
- [ ] Verify all agent runs logged in `agent_logs`

**Bug fixes**
- [ ] Fix all broken flows found above
- [ ] No console errors in browser DevTools
- [ ] No unhandled promise rejections in server logs

---

## DAY 14 — Documentation
> Goal: All required docs for course submission complete

- [ ] `docs/ai-prompts.md` — document all prompts:
  - [ ] Diagnostic Agent system prompt
  - [ ] Blood Report Agent system prompt
  - [ ] Doctor Assist Agent system prompt
  - [ ] Gemini Vision OCR prompt
  - [ ] Blood test recommendation prompt
  - [ ] All 5 tool definitions with descriptions
- [ ] `README.md` (project root) — add:
  - [ ] Architecture diagram (Mermaid)
  - [ ] Setup instructions (clone → install → env → run)
  - [ ] Docker Compose instructions
- [ ] Fill out `CS595_2026_Project_Info_Template.docx`:
  - [ ] LOF Pillar: Patient Engagement
  - [ ] Architecture diagram
  - [ ] Functional requirements list
  - [ ] User stories (patient + doctor)
  - [ ] Sprint history (15-day breakdown)
  - [ ] AI tools used section
- [ ] Push all code to GitHub
- [ ] Verify `.gitignore` excludes `.env`, `uploads/`, `node_modules/`
- [ ] Verify repo is clean (no secrets committed)

---

## DAY 15 — Demo Prep & Submission
> Goal: Demo-ready, everything submitted

- [ ] Reset DB and re-run seed data for clean demo state
- [ ] Create 2 clean demo accounts (patient + doctor) with memorable passwords
- [ ] Prepare 5–7 min demo script:
  - [ ] Patient registration
  - [ ] Symptom form → live agent steps
  - [ ] Disease results with ICD codes
  - [ ] Blood report upload → FDA API calls live
  - [ ] Analysis page with personalized dosages
  - [ ] Doctor referral → map
  - [ ] Doctor account → Assist Agent
  - [ ] Agent log viewer (show professor the tool call audit trail)
- [ ] Record demo video (OBS or Loom, screen + mic)
- [ ] Final GitHub push — clean commit history
- [ ] Submit: GitHub URL + video link + Project Info Template

---

## Summary Progress

| Day | Focus | Done |
|-----|-------|------|
| 1 | Scaffold + DB | 20/20 DONE |
| 2 | Auth system | 0/14 |
| 3 | Symptom intake | 0/11 |
| 4 | Diagnostic Agent | 0/13 |
| 5 | Results + SSE UI | 0/11 |
| 6 | Upload + OCR | 0/11 |
| 7 | Blood Report Agent | 0/10 |
| 8 | Analysis page | 0/7 |
| 9 | Doctor map | 0/10 |
| 10 | Doctor Assist Agent | 0/14 |
| 11 | Logs + error handling | 0/11 |
| 12 | UI polish | 0/10 |
| 13 | E2E testing | 0/17 |
| 14 | Documentation | 0/12 |
| 15 | Demo + submission | 0/10 |
