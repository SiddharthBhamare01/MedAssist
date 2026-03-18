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
- [ ] `server/controllers/authController.js` — `register()` + `login()` functions (logic placed directly in routes instead of a separate controller file)
- [x] `server/middleware/auth.js` — JWT verification middleware (`req.user`) ✅
- [x] `server/routes/auth.js` — wire up POST `/register` and POST `/login` ✅
- [ ] `server/models/queries.js` — `createPatientProfile()`, `createDoctorProfile()` (created `models/User.js` with `findByEmail()` + `createUser()` instead; profile creation deferred to Day 3)
- [x] Test register (patient) with curl → JWT returned, user saved to Supabase ✅
- [ ] Test register (doctor) → doctor profile saved (doctor profile creation not yet implemented)
- [x] Test login with wrong password → 401 returned ✅

**Frontend**
- [x] `client/src/pages/Auth/Register.jsx` — full form: name, email, password, role toggle (Patient/Doctor) ✅ (doctor-only fields like specialization/hospital deferred to Day 3/10)
- [x] `client/src/pages/Auth/Login.jsx` — email + password form ✅
- [ ] `client/src/services/authService.js` — API calls made directly from components; separate service file not created
- [x] Update `AuthContext.jsx` — store `{ token, id, email, role, name }` + localStorage persistence ✅
- [x] Update Axios interceptor in `api.js` — attach `Authorization: Bearer <token>` header ✅
- [x] `PrivateRoute.jsx` — redirect to `/login` if no token or wrong role ✅ (was scaffolded Day 1, verified working)
- [x] Login redirects: patient → `/patient/intake`, doctor → `/doctor/dashboard` ✅
- [x] Logout clears auth state and redirects to `/login` ✅
- [x] Form validation with inline error messages (HTML5 + react-hot-toast) ✅
- [x] Test: register → login → redirect works for both roles ✅

---

## DAY 3 — Patient Profile + Symptom Intake Wizard
> Goal: 3-step form saves profile and collects symptoms

**Backend**
- [x] `server/routes/patient.js` — GET + PUT `/api/patient/profile` with JWT auth ✅
- [ ] `server/controllers/patientController.js` — logic placed directly in routes, no separate controller
- [x] `server/models/patientQueries.js` — `upsertPatientProfile()`, `getPatientProfile()`, `createSymptomSession()`, `getSymptomSession()` ✅
- [x] Test: PUT `/api/patient/profile` with JWT → creates profile in Supabase ✅
- [x] Test: PUT again → upserts (updates existing row) ✅
- [x] Test: GET → returns saved profile ✅
- [x] Test: no token → 401 ✅

**Frontend**
- [x] `client/src/pages/Patient/Intake.jsx` — 3-step wizard using `react-hook-form`: ✅
  - [x] **Step 1**: Age, gender, weight (kg), height (cm), blood group ✅
  - [x] **Step 2**: Existing conditions (multi-checkbox), allergies (tag input), medications (tag input), smoking/alcohol radios ✅
  - [x] **Step 3**: 36 symptoms across 7 body systems; each selected shows duration input, severity slider (1–10), onset radio ✅
- [x] Progress bar showing current step (1/3, 2/3, 3/3) ✅
- [x] Validation on each step before allowing Next ✅
- [x] Step 1+2 data saved to profile via PUT `/api/patient/profile` ✅
- [x] Step 3 submit calls POST `/api/disease/predict` → creates session in DB ✅
- [x] Loading spinner on submit ✅
- [x] Navigate to `/patient/results` with sessionId after submit ✅
- [x] Bug fix: blood group radio buttons clickable with visual highlight (added `watch` from react-hook-form) ✅
- [x] Bug fix: profile save + symptom submit errors resolved (stale PID 20752 killed, server restarted with new code) ✅

---

## DAY 4 — Groq Diagnostic Agent with ICD-10 Tool Calls
> Goal: Real agentic loop running with ICD code tool calls
> Note: Switched from Gemini to Groq (llama-3.3-70b-versatile) — Gemini free tier quota=0 in this region

**Backend**
- [x] `server/agents/tools/medicalTools.js` — all 5 tool definitions (OpenAI/Groq format) ✅
- [x] `server/agents/tools/medicalTools.js` — `lookup_icd_code` (NIH ClinicalTables API) ✅
- [x] `server/agents/tools/medicalTools.js` — `get_lab_reference_range` (40-parameter hardcoded table) ✅
- [x] `server/agents/tools/medicalTools.js` — `search_drug_by_condition` (OpenFDA API) ✅
- [x] `server/agents/tools/medicalTools.js` — `check_drug_interactions` (RxNorm API) ✅
- [x] `server/agents/tools/medicalTools.js` — `get_drug_details` (OpenFDA label API) ✅
- [x] `server/agents/agentRunner.js` — Groq multi-turn agentic loop (MAX_TURNS=10) ✅
- [x] `server/utils/eventEmitter.js` — session-scoped EventEmitter map for SSE ✅
- [x] `server/agents/diagnosticAgent.js` — Diagnostic Agent using agentRunner.js ✅
- [ ] `server/controllers/diseaseController.js` — logic placed directly in route, no separate controller
- [x] `server/models/patientQueries.js` — added `updateSessionDiseases()`, `saveAgentLog()` ✅
- [x] `server/routes/disease.js` — POST `/api/disease/predict` runs real agent ✅
- [x] Test: symptoms → Groq calls ICD tool → returns 5 diseases with ICD codes ✅ (3 turns, verified)
- [x] Verify `agent_logs` table populated with tool call steps ✅

---

## DAY 5 — Disease Results Page + Agent Status SSE UI
> Goal: Patient watches live agent steps then sees disease cards

**Backend**
- [x] `server/routes/agentStatus.js` — SSE endpoint `GET /api/agent/status/:sessionId` ✅
- [x] Agent emits step events to session EventEmitter during tool calls (already done in Day 4) ✅
- [x] `server/services/groqService.js` — `getRecommendedBloodTests(disease, patientProfile)` (single-turn Groq call, not Gemini) ✅
- [x] `server/routes/disease.js` — POST `/api/disease/tests` ✅
- [x] `server/models/patientQueries.js` — `updateSessionTests(sessionId, tests)` ✅
- [x] `server/db/schema.sql` — `recommended_tests` column changed to JSONB ✅
- [x] `server/db/migrations/001_recommended_tests_jsonb.sql` — migration for existing DBs ✅
- [x] `server/routes/agentStatus.js` — GET `/api/agent/logs/:sessionId` (bonus, moved from Day 11) ✅

**Frontend**
- [x] `client/src/hooks/useAgentStatus.js` — custom hook using `EventSource` for SSE subscription ✅
- [x] `client/src/components/AgentStatus/AgentStatusPanel.jsx` — live step tracker UI (pulse dot, scrolling steps) ✅
- [x] `client/src/pages/Patient/Results.jsx` — already built in Day 4: disease cards, ICD codes, probability bars, select + "Get Blood Tests" ✅
- [x] `client/src/pages/Patient/Tests.jsx` — full blood test cards (urgency badge, normal range, print button, summary strip) ✅

---

## DAY 6 — Blood Tests Page + Upload UI + PDF OCR
> Goal: Blood tests displayed, PDF upload works, OCR extracts values
> Note: Gemini Vision quota=0 in this region. Switched to pdf-parse + Groq for PDF OCR (same strategy as Day 4)

**Backend**
- [x] `server/middleware/upload.js` — Multer config (accept JPG/PNG/PDF, max 10MB, save to `uploads/`) ✅
- [x] `server/services/geminiService.js` — dual-path OCR service ✅
  - [x] PDF → `pdf-parse@1.1.1` extracts text → Groq (`llama-3.3-70b-versatile`) parses structured JSON ✅
  - [x] Image → Gemini Vision attempted; clear error shown if quota=0 ✅
- [x] `server/routes/bloodReport.js` — POST `/api/blood-report/upload` (JWT auth + Multer + OCR + save to DB) ✅
- [x] `server/routes/bloodReport.js` — GET `/api/blood-report/:id` (fetch saved report by ID) ✅
- [x] Fix: `recommended_tests` column migrated from `text[]` → `JSONB` in Supabase (migration 001 applied) ✅
- [x] Fix: `pdf-parse` downgraded to v1.1.1 (v2.x had incompatible class-based API) ✅
- [x] Fix: `max_tokens` increased to 8000 (2000 caused truncated JSON for large 35+ parameter reports) ✅
- [x] Test: upload real blood PDF (9-page, 35+ parameters, bilingual EN+CN) → Groq extracts all values ✅

**Frontend**
- [x] `client/src/pages/Patient/Tests.jsx`: complete from Day 5 — cards, urgency badges, print CSS, "Upload Report →" button ✅
- [x] `client/src/pages/Patient/UploadReport.jsx`:
  - [x] Drag-and-drop zone (accept JPG, PNG, PDF) ✅
  - [x] Image preview after drop/select (PDF shows icon) ✅
  - [x] File validation (type + size) ✅
  - [x] Upload progress bar (axios onUploadProgress) ✅
  - [x] "Analyze Report" button → POST multipart to `/api/blood-report/upload` ✅
  - [x] Loading state: "Gemini Vision is reading your blood report values…" ✅
  - [x] Extracted values table (parameter, value, unit, normal range, status badge) ✅
  - [x] "Get AI Analysis →" button → navigate to `/patient/analysis` with reportId + extracted values ✅

---

## DAY 7 — Blood Report Agent (Most Complex)
> Goal: Full agentic loop with OpenFDA + RxNorm tool calls + medication plan

**Backend**
- [x] `server/agents/bloodReportAgent.js` — Blood Report Agent with full agentic loop ✅
  - [x] Calls `get_lab_reference_range` for all abnormal parameters ✅
  - [x] Calls `search_drug_by_condition` for FDA-approved drugs per condition ✅
  - [x] Calls `get_drug_details` for dosage + contraindication check ✅
  - [x] Calls `check_drug_interactions` if patient has existing medications ✅
  - [x] Sets `doctor_referral_needed=true` if 3+ critical values / drug interaction / age>70 ✅
  - [x] Fallback result if JSON parsing fails — always returns safe structured response ✅
  - [x] Saves analysis + tablet_recommendations + complexity_flag to `blood_reports` table ✅
  - [x] Saves agent audit log to `agent_logs` table ✅
  - [x] Emits SSE steps via `getEmitter(reportId)` — compatible with existing AgentStatusPanel ✅
- [x] `server/routes/bloodReport.js` — kept upload as OCR-only; added POST `/api/blood-report/analyze` ✅
  - [x] Returns cached analysis if already run (avoids re-running agent) ✅
- [x] Test: upload blood report → click analyze → verify agent calls FDA API → medication plan returned
- [x] Test: patient with existing meds → verify interaction check runs
- [x] Verify `agent_logs` populated with all tool call steps

**Frontend**
- [x] `client/src/pages/Patient/Analysis.jsx` — full 5-section analysis page (built ahead of Day 8) ✅
  - [x] Section 1: Overall summary + root cause + complexity badge ✅
  - [x] Section 2: Abnormal findings table (color-coded rows, status badges) ✅
  - [x] Section 3: Treatment solutions bulleted list ✅
  - [x] Section 4: Tablet recommendations cards (dosage, frequency, duration, FDA badge, contraindication) ✅
  - [x] Section 5: Doctor referral alert banner + "Find a Doctor →" button (conditional) ✅
  - [x] AgentStatusPanel shown during loading ✅
  - [x] Caches reportId + calls POST `/api/blood-report/analyze` on mount ✅

---

## DAY 8 — Blood Report Analysis Page
> Goal: Full analysis displayed with all 5 sections
> Note: Analysis.jsx was fully built during Day 7 — Day 8 is complete

**Frontend**
- [x] `client/src/pages/Patient/Analysis.jsx` — all 5 sections built ✅ (done in Day 7)
  - [x] Section 1 — Summary: overall assessment, root cause, complexity badge ✅
  - [x] Section 2 — Abnormal Findings Table: color-coded rows, status badges ✅
  - [x] Section 3 — Treatment Solutions: bulleted list ✅
  - [x] Section 4 — Tablet Recommendations: cards with dosage, frequency, duration, FDA badge, contraindication ✅
  - [x] Section 5 — Doctor Referral (conditional): alert banner + referral reason + "Find Doctor" button ✅
- [x] AgentStatusPanel shown during loading ✅
- [x] Navigates to `/patient/doctors` from referral section ✅

---

## DAY 9 — Doctor Finder Map
> Goal: Geolocation + Leaflet map + doctor list + filter

**Backend**
- [x] `server/services/locationService.js` — Haversine distance formula ✅
- [x] `server/services/osmService.js` — real-time Overpass API (3 mirrors + 5-min cache + 20s timeout) ✅
- [x] `server/routes/doctors.js` — GET `/api/doctors/nearby?lat=&lng=&radius=&source=` ✅
- [x] Auto-fallback to seeded DB data if all Overpass mirrors fail (504/429 handled) ✅
- [x] Test: live OSM data returned for real GPS coordinates ✅

**Frontend**
- [x] `client/src/pages/Patient/Doctors.jsx` — full implementation ✅
  - [x] Request `navigator.geolocation` from browser with full-screen permission prompt ✅
  - [x] Fetch real-time doctor/clinic/hospital data from OpenStreetMap via Overpass API ✅
  - [x] Leaflet map fills full remaining viewport height (not square) — sidebar LEFT, map RIGHT ✅
  - [x] Scrollable sidebar list: name, type badge, address, distance, phone, website ✅
  - [x] Click sidebar row or marker → map popup with full doctor info ✅
  - [x] Specialty filter dropdown — client-side filtering (never loses options after selecting) ✅
  - [x] Radius selector: 2 / 5 / 10 / 20 / 50 miles (converted to metres for API) ✅
  - [x] Distance displayed in miles throughout (sidebar badge + map popup) ✅
  - [x] "Get Directions" link (OpenStreetMap routing) in popup + sidebar ✅
  - [x] "Expand search radius" button when 0 results ✅
  - [x] "Retry live data" button when showing fallback demo data ✅
  - [x] Live OSM / Demo data indicator badge in disclaimer bar ✅

---

## DAY 10 — Doctor Dashboard + Doctor Assist Agent
> Goal: Doctor login works, dashboard shows history, Assist Agent running

**Backend**
- [x] `server/agents/doctorAssistAgent.js` — Doctor Assist Agent ✅
  - [x] Calls `lookup_icd_code` to confirm clinical context + ICD-10 code ✅
  - [x] Calls `get_lab_reference_range` to enumerate standard tests for condition ✅
  - [x] Compares against existing prescription → flags gaps ✅
  - [x] Returns `[{ test_name, reason, urgency: 'routine'|'urgent'|'critical', reference_range }]` ✅
- [x] `server/routes/doctorAssist.js` — POST `/api/doctor-assist/suggest-tests` (JWT, doctor-only) ✅
- [x] `server/routes/doctorAssist.js` — GET `/api/doctor-assist/sessions` ✅
- [x] `server/routes/doctorAssist.js` — GET `/api/doctor-assist/profile` (doctor name + specialization) ✅
- [x] `server/models/doctorQueries.js` — `saveDoctorAssistSession()`, `getDoctorAssistHistory()`, `getDoctorProfile()` ✅
- [x] Agent steps saved to `agent_logs` table ✅
- [ ] Test: submit patient case → agent suggests missing tests with urgency levels

**Frontend**
- [x] `client/src/pages/Doctor/Dashboard.jsx` ✅
  - [x] Greeting + doctor name, specialization, hospital from profile ✅
  - [x] Stats row: total sessions, urgent/critical count, total tests suggested ✅
  - [x] "New Patient Assist" CTA button → `/doctor/assist` ✅
  - [x] Recent sessions list: chief complaint, patient summary, urgency badges, test names ✅
  - [x] Click session → navigates to Assist page with prefilled results ✅
- [x] `client/src/pages/Doctor/Assist.jsx` ✅
  - [x] Left panel: age, gender, weight, height, chief complaint, symptoms, duration, known conditions ✅
  - [x] Right panel: 18 common test checkboxes + free-text additional tests (comma-separated) ✅
  - [x] "Get AI Suggestions" button with loading spinner ✅
  - [x] `AgentStatusPanel` shown live while agent runs (SSE steps) ✅
  - [x] Results table: # | Test Name | Clinical Reason | Reference Range | Urgency badge ✅
  - [x] Summary strip: Critical / Urgent / Routine counts ✅
  - [x] "Copy to Clipboard" button — formatted plain text ✅

---

## DAY 11 — Agent Log Viewer + Error Handling
> Goal: Agent audit trail visible in UI, all errors handled gracefully

**Backend**
- [x] `server/routes/agentStatus.js` — GET `/api/agent/logs/:sessionId` ✅ (was already built Day 5)
- [x] `agentRunner.js` — MAX_TURNS fallback: final tool-free call to extract JSON answer ✅
- [x] `agentRunner.js` — tool_use_failed fallback: tool-free completion (built Day 10) ✅
- [x] All tool handlers — try/catch + `{ note: 'Data unavailable' }` fallback (medicalTools.js) ✅
- [x] OpenFDA 404 / RxNorm empty results → graceful fallback (already in medicalTools.js) ✅
- [x] `express-rate-limit` active on all agent routes (index.js `agentLimiter`) ✅

**Frontend**
- [x] `client/src/components/AgentLogModal.jsx` — full modal with expandable tool call rows ✅
  - [x] Each tool call: tool name, input params, smart result preview, timestamp ✅
  - [x] Total reasoning turns count in modal header ✅
  - [x] Close on Escape key or overlay click ✅
- [x] Doctor Dashboard — "🔍 View Agent Log" button per session → opens AgentLogModal ✅
- [x] `client/src/services/api.js` — interceptor toasts on 429, 500+, network errors ✅
- [x] `client/src/components/ErrorBoundary.jsx` — class component with Try Again + Go Home ✅
- [x] `App.jsx` — ErrorBoundary wraps every page inside Layout ✅

---

## DAY 12 — Full UI Polish ✅ 11/11 complete
> Goal: Responsive, accessible, professional-looking UI

- [x] Color audit: primary blue `#1A73E8`, white backgrounds, gray cards consistent throughout ✅
- [x] Mobile responsive: Navbar hamburger menu + sm/lg breakpoints on all pages ✅
- [x] All forms: validate on submit, inline error messages (react-hook-form) ✅
- [x] All API calls: loading spinner or skeleton shown ✅
- [x] Empty states: meaningful messages when no data on all pages ✅
- [x] Disclaimer banner visible on every protected page (Layout wrapper) ✅
- [x] ARIA labels on all inputs, buttons, modals (role="dialog", aria-modal, aria-label) ✅
- [x] Breadcrumb navigation on Results → Tests → Upload → Analysis flow ✅
- [x] Print CSS: `@media print` global + `.print:hidden` classes on Tests page ✅
- [x] Favicon (medical cross SVG) + `<title>MedAssist AI</title>` in index.html ✅
- [x] Fixed "Gemini Vision" copy → "AI is extracting values…" in UploadReport ✅

---

## DAY 13 — End-to-End Integration Testing ✅ Complete
> Goal: Both complete flows work without errors

**Automated Test Script**
- [x] `server/tests/integration.js` — 25-test automated suite covering all flows ✅
  - Run with: `node tests/integration.js` (server must be on port 5000)

**Patient Flow**
- [x] Register new patient account ✅
- [x] Fill 3-step intake form (fatigue + increased thirst + weight loss) ✅
- [x] Diagnostic Agent returns 5 diseases with ICD codes ✅
- [x] Blood test recommendations returned with urgency levels ✅
- [x] Patient sessions saved to DB ✅
- [x] Blood report upload + analysis (sections 1-6 all present) ✅
- [x] Doctor finder returns providers ✅

**Doctor Flow**
- [x] Register doctor account ✅
- [x] Doctor profile save/retrieve ✅
- [x] Doctor Assist Agent returns missing tests with urgency badges ✅
- [x] Doctor sessions saved to DB ✅
- [x] Agent logs accessible per session ✅

**Bug Fixes Applied**
- [x] `agentStatus.js` — SSE endpoint wrapped in try/catch + error event handler ✅
- [x] `diagnosticAgent.js` — DB saves wrapped in try/catch (agent result still returned on DB fail) ✅
- [x] `bloodReportAgent.js` — DB saves wrapped in try/catch ✅
- [x] `bloodReport.js` — null patientProfile handled safely (.catch(() => null)) ✅
- [x] `doctorAssist.js` — undefined profile fields sanitized to null before DB insert ✅
- [x] Blood report cache bug — incomplete cached results cleared and re-run ✅

**Edge Cases Validated**
- [x] Missing auth token → 401 ✅
- [x] Wrong role → 403 ✅
- [x] Missing required fields → 400 ✅
- [x] Non-existent reportId → 404 ✅
- [x] Empty symptoms array → 400 ✅

---

## DAY 14 — Documentation
> Goal: All required docs for course submission complete

**AI Prompts Documentation**
- [ ] Create `docs/` folder at project root
- [ ] `docs/ai-prompts.md` — document all agent system prompts verbatim:
  - [ ] Diagnostic Agent full system prompt (role, output format, DIAGNOSIS_COMPLETE sentinel)
  - [ ] Blood Report Agent Phase 1 system prompt (tool-use phase)
  - [ ] Blood Report Agent Phase 2a system prompt (medical JSON output)
  - [ ] Blood Report Agent Phase 2b system prompt (lifestyle JSON output)
  - [ ] Doctor Assist Agent system prompt (missing tests + ICD-10)
  - [ ] Gemini Vision OCR prompt (lab value extraction schema)
  - [ ] Blood test recommendation single-turn prompt
- [ ] `docs/ai-prompts.md` — document all 5 tool definitions:
  - [ ] `lookup_icd_code` — schema + NIH ClinicalTables endpoint
  - [ ] `get_lab_reference_range` — schema + 40-parameter table explanation
  - [ ] `search_drug_by_condition` — schema + OpenFDA endpoint
  - [ ] `get_drug_details` — schema + OpenFDA label endpoint
  - [ ] `check_drug_interactions` — schema + RxNorm endpoint

**API & Architecture Documentation**
- [ ] `docs/api-reference.md` — full API contract:
  - [ ] Auth endpoints (POST /register, POST /login) with request/response examples
  - [ ] Patient endpoints (GET/PUT /profile, GET /sessions)
  - [ ] Disease endpoints (POST /predict, POST /tests)
  - [ ] Blood report endpoints (POST /upload, POST /analyze, GET /:id)
  - [ ] Doctor assist endpoints (POST /suggest-tests, GET /sessions, GET/PUT /profile)
  - [ ] SSE endpoint (GET /agent-status/stream/:sessionId) with event format
  - [ ] Agent logs endpoint (GET /agent-logs/:sessionId)
  - [ ] Nearby doctors endpoint (GET /nearby-doctors?city=&state=)
- [ ] `docs/architecture.md` — architecture narrative:
  - [ ] Data flow diagram: Patient symptom → Diagnostic Agent → Disease results → Tests → OCR → Blood Agent → Analysis
  - [ ] Data flow diagram: Doctor case input → Doctor Assist Agent → Missing tests
  - [ ] SSE streaming architecture explanation (EventEmitter map, session lifecycle)
  - [ ] Database schema rationale (why 7 tables, JSONB fields, cascades)
  - [ ] Rate-limiting strategy (Groq 12k TPM, 2s delays, 429 retry)

**Course Submission Docs**
- [ ] `docs/user-stories.md`:
  - [ ] Patient user stories (registration through analysis flow — 8+ stories)
  - [ ] Doctor user stories (login through session history — 5+ stories)
  - [ ] Acceptance criteria for each story
- [ ] `docs/functional-requirements.md`:
  - [ ] FR-1 through FR-20 numbered requirements
  - [ ] Non-functional requirements (performance, security, accessibility)
  - [ ] LOF Pillar mapping: Patient Engagement, Clinical Decision Support
- [ ] Fill out `CS595_2026_Project_Info_Template.docx`:
  - [ ] LOF Pillar: Patient Engagement + Clinical Decision Support
  - [ ] Architecture diagram (copy from docs/architecture.md)
  - [ ] Functional requirements list (copy from docs/)
  - [ ] User stories table (patient + doctor flows)
  - [ ] Sprint history — 15-day breakdown with dates (Mar 7–21, 2026)
  - [ ] AI tools used: Groq llama-3.3-70b, Gemini Vision, tool-calling pattern
  - [ ] Free APIs used: OpenFDA, RxNorm, NIH ClinicalTables, OSM Nominatim
  - [ ] Known limitations section (Groq TPM, Gemini Vision quota, no real appointment booking)

**GitHub Setup**
- [ ] Verify `.gitignore` excludes `.env`, `uploads/`, `node_modules/`, `.claude/`
- [ ] Verify no secrets committed (`git log --all --full-history -- "**/.env"`)
- [ ] Add `server/.env.example` with all keys blanked out
- [ ] Create day-wise git commits for Days 5–13 (see Git Commit Plan below)
- [ ] Final Day 14 commit: `docs: add ai-prompts, api-reference, architecture, user-stories`
- [ ] Push to GitHub: `git push origin main`
- [ ] Verify GitHub repo is public and all files visible

---

## DAY 15 — Demo Prep & Submission
> Goal: Demo-ready, everything polished and submitted

**Database Reset for Demo**
- [ ] Run `server/db/seed.sql` against Supabase to reset demo data
- [ ] Create 2 clean demo accounts manually or via seed:
  - [ ] Patient: `patient@demo.com` / `Demo1234!` — pre-filled profile (age 45, M, diabetic history)
  - [ ] Doctor: `doctor@demo.com` / `Demo1234!` — specialization: Internal Medicine, Phoenix AZ
- [ ] Verify all 7 DB tables clean and seeded
- [ ] Test full patient flow end-to-end from fresh login

**Demo Script (7–10 min)**
- [ ] Slide 1 (30s): Project overview — what MedAssist AI does, two roles, tech stack
- [ ] Scene 1 — Patient Registration (45s):
  - [ ] Register new patient account live
  - [ ] Show role selection (Patient / Doctor toggle)
- [ ] Scene 2 — Symptom Intake (90s):
  - [ ] Fill Step 1: age 35, male, 80kg, 175cm, O+
  - [ ] Fill Step 2: add "Diabetes" existing condition, "Penicillin" allergy tag
  - [ ] Fill Step 3: select fatigue (7/10 severity), increased thirst, frequent urination (all 1-week onset)
  - [ ] Submit and show progress bar
- [ ] Scene 3 — Live Agent Steps + Results (60s):
  - [ ] Show AgentStatusPanel pulsing with ICD tool calls in real time
  - [ ] Results page: 5 disease cards with ICD codes and probability bars
  - [ ] Expand agent log modal — show tool call audit trail (professor key moment)
- [ ] Scene 4 — Blood Test Recommendations (30s):
  - [ ] Select top diagnosis → "Get Blood Tests"
  - [ ] Show test cards with urgency badges (critical/urgent/routine)
- [ ] Scene 5 — Blood Report Upload + Analysis (90s):
  - [ ] Upload real PDF blood report (have file ready on desktop)
  - [ ] Show OCR extraction table (all values, status flags)
  - [ ] Click "Get AI Analysis" → show agent steps (FDA API calls live)
  - [ ] Walk through 5 tabs: Summary, Findings, Treatment, Tablets, Diet
  - [ ] Show doctor referral banner → "Find a Doctor"
- [ ] Scene 6 — Doctor Finder Map (30s):
  - [ ] Allow geolocation in browser
  - [ ] Show live OSM pins, sidebar list, click marker for popup
- [ ] Scene 7 — Doctor Account + Assist Agent (90s):
  - [ ] Log in as doctor demo account
  - [ ] Show dashboard: stats, recent sessions
  - [ ] Submit new patient case (45M, chest pain, existing ECG + CBC)
  - [ ] Show agent finding missing tests with urgency levels
  - [ ] Show "Copy to Clipboard" output
- [ ] Close (30s): mention tech stack, free APIs, LOF pillar

**Final QA Checklist Before Recording**
- [ ] Server starts clean: `cd medassist/server && npm run dev`
- [ ] Client starts clean: `cd medassist/client && npm run dev`
- [ ] No console errors on any page
- [ ] All 29 integration tests pass: `node tests/integration.js`
- [ ] Mobile view: resize to 375px — hamburger nav works on all pages
- [ ] Print test: open Tests page → Ctrl+P → check layout
- [ ] SSE test: run agent → confirm steps appear in panel

**Recording & Submission**
- [ ] Record demo video (OBS Studio or Loom — screen + mic)
  - [ ] Resolution: 1920×1080 minimum
  - [ ] Show browser address bar (proves it's localhost, not static mockup)
  - [ ] Keep recording under 10 minutes
- [ ] Upload video to YouTube (unlisted) or Google Drive
- [ ] Final GitHub commit: `chore: Day 15 - demo prep, seed reset, final submission`
- [ ] Push: `git push origin main`
- [ ] Submit to course portal:
  - [ ] GitHub repo URL
  - [ ] Demo video link
  - [ ] `CS595_2026_Project_Info_Template.docx` filled out

---

## GIT COMMIT PLAN — Day-wise History
> Days 1–4 already have clean commits. Days 5–13 need individual commits retroactively.
> Use interactive rebase or cherry-pick strategy, OR create new commits for each day's work summary.

**Commits to create (in order):**
```
feat: Day 5 - disease results page + live SSE agent status UI
feat: Day 6 - blood report upload UI + PDF OCR with pdf-parse + Groq
feat: Day 7 - blood report agent with OpenFDA + RxNorm tool calls
feat: Day 8 - full blood report analysis dashboard (6 tabs)
feat: Day 9 - doctor finder map with Leaflet + OpenStreetMap live data
feat: Day 10 - doctor dashboard + doctor assist agent
feat: Day 11 - agent log modal + error handling + rate limiting
feat: Day 12 - responsive UI polish + ARIA accessibility + print CSS
feat: Day 13 - 29 E2E integration tests + bug fixes
docs: Day 14 - ai-prompts, api-reference, architecture, user-stories docs
chore: Day 15 - demo prep, seed reset, final submission
```

**Steps to create day-wise commits:**
1. `git log --oneline` — identify current HEAD
2. For each day's work, create a tagged commit with the message above
3. Push: `git push origin main`

---

## END-TO-END HEALTHCARE FLOW — Gap Analysis
> These are stretch goals for completeness beyond the 15-day plan

**Patient Journey Gaps (nice to have)**
- [ ] Health history timeline — show all past sessions in a timeline view
- [ ] Symptom trend tracking — compare symptom severity across multiple sessions
- [ ] Export medical summary as PDF (patient takes to real doctor)
- [ ] Medication reminder UI — show prescribed tablets with "Add to Calendar" option

**Doctor Journey Gaps (nice to have)**
- [ ] View patient's blood report directly in doctor dashboard (patient shares reportId)
- [ ] Doctor can annotate/add notes to a patient's diagnosis session
- [ ] Cross-patient analytics — aggregate stats (common diagnoses, avg urgency)

**Platform Gaps (important for production)**
- [ ] Rate limit feedback — show user "Agent is throttled, retry in Xs" when Groq 429 hits
- [ ] Session expiry UX — show "Your session expired, please log in again" instead of silent 401
- [ ] Password reset flow (email-based)
- [ ] HTTPS + environment variable validation on server startup

---

## Summary Progress

| Day | Focus | Status |
|-----|-------|--------|
| 1 | Scaffold + DB | ✅ 20/20 DONE |
| 2 | Auth system | ✅ 11/14 (3 deferred, acceptable) |
| 3 | Symptom intake | ✅ 16/16 DONE |
| 4 | Diagnostic Agent | ✅ 13/14 DONE |
| 5 | Results + SSE UI | ✅ 11/11 DONE |
| 6 | Upload + OCR | ✅ 14/14 DONE |
| 7 | Blood Report Agent | ✅ 13/13 DONE |
| 8 | Analysis page | ✅ 7/7 DONE (built Day 7) |
| 9 | Doctor map | ✅ 16/16 DONE |
| 10 | Doctor Assist Agent | ✅ 13/14 DONE |
| 11 | Logs + error handling | ✅ 11/11 DONE |
| 12 | UI polish | ✅ 11/11 DONE |
| 13 | E2E testing | ✅ 25+ tests DONE |
| 14 | Documentation | ⏳ 0/28 TODO |
| 15 | Demo + submission | ⏳ 0/22 TODO |
