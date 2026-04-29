# MedAssist — Project Refocus Roadmap
## Blood Report Analysis · Patient Engagement Plan

> **Purpose:** This file tracks the full refocus plan. Update the checkboxes as each task is completed.
> Last updated: 2026-04-28 (Phase 2 complete)

---

## Context

The project covers two journeys: (1) symptom-based disease diagnosis and (2) blood report analysis. **Decision: drop the diagnosis journey entirely.** Focus exclusively on helping patients understand their own lab results — AI-powered insights, diet guidance, risk scores, and progress tracking. We are not diagnosing diseases or being a doctor.

---

## Phase 1 — CLEANUP: Remove Irrelevant Features

### Patient Pages to Delete
- [x] `client/src/pages/Patient/Intake.jsx` — symptom intake wizard (3-step form, diagnosis-only)
- [x] `client/src/pages/Patient/Results.jsx` — AI-predicted disease results
- [x] `client/src/pages/Patient/Tests.jsx` — blood test recommendations for a disease
- [x] `client/src/pages/Patient/Medications.jsx` — medication dose tracker (prescription-based)
- [x] `client/src/pages/Patient/Appointments.jsx` — book doctor appointments
- [x] `client/src/pages/Patient/Prescriptions.jsx` — view doctor prescriptions
- [x] `client/src/pages/Patient/MedicalID.jsx` — emergency ID card
- [x] `client/src/pages/Patient/HealthTimeline.jsx` — mixed event timeline (mostly symptom sessions)
- [x] `client/src/components/VoiceIntake.jsx` — voice assistant for intake wizard

### Backend Routes / Agents to Remove
- [x] `server/routes/disease.js` — entire diagnostic agent pipeline (`/api/disease/*`)
- [x] `server/agents/diagnosticAgent.js` — symptom → disease prediction agent
- [x] `server/routes/appointments.js` — appointment booking (`/api/appointments/*`)
- [x] Unregister `disease` and `appointments` routes in `server/index.js`
- [x] Remove from `server/routes/patient.js`:
  - `GET/POST /api/patient/prescriptions`
  - `GET/POST /api/patient/medications`
  - `PUT/DELETE /api/patient/medications/:id`
  - `GET /api/patient/medications/sources`
  - `GET/PUT /api/patient/medical-id` + QR route
- [x] Remove `POST /api/voice/parse` from `server/routes/voice.js` (intake wizard only)

### Dashboard Cleanup (`PatientDashboard.jsx`)
- [x] Remove "New Assessment" CTA button
- [x] Remove "In-Progress Sessions" section (symptom session cards with progress bar)
- [x] Remove the `Symptoms → Diagnosed → Tests → Uploaded → Analyzed` progress pipeline
- [x] Keep: "Analyze Blood Report" quick-upload CTA
- [x] Keep: "Direct Blood Report Analyses" section (standalone reports)

### Analysis Page Cleanup (`Analysis.jsx`)
- [x] Remove doctor referral section ("Professional Medical Consultation Required" red card)
- [x] Remove "Looking for a doctor anyway?" CTA at the bottom
- [x] Remove disease context line in header ("Context: {disease}")

### Navigation Cleanup (`Navbar.jsx` + `App.jsx`)
- [x] Remove nav links: Medications, Appointments, Prescriptions, Timeline, Medical ID
- [x] Remove routes from `App.jsx` for the 8 deleted pages
- [x] Rename "Doctors" nav link → **"Find a Lab / Clinic"** (keep for locating test centers)
- [x] Rename `Doctors.jsx` page title/heading

### DB Tables (stop using, do not delete)
- `symptom_sessions`, `appointments`, `medication_logs`, `prescriptions`, `doctor_assist_sessions`, `doctor_patients`, `patient_doctor_access`

---

## Phase 2 — NEW CORE FEATURES (High Priority)

### Feature 1 — Blood Report History & Trend Charts ⭐
**Page:** `/patient/history` → `ReportHistory.jsx`

- [x] **Backend:** `GET /api/blood-report/history` — all reports for patient, sorted by date, with `extracted_values`
- [x] **Frontend:** New page listing all past reports as cards with date + parameter count + abnormal count
- [x] **Frontend:** Click a parameter → line chart (Recharts, reuse Vitals.jsx pattern) showing its value across all reports
- [x] **Frontend:** Add "My Reports" to navbar + `App.jsx` route `/patient/history`

**Key parameters to trend:** Hemoglobin, HbA1c, Cholesterol (Total/LDL/HDL), Glucose, Creatinine, WBC, Platelets

---

### Feature 2 — Report Comparison (Side-by-Side) ⭐
**Component:** `CompareModal.jsx`

- [x] **Backend:** `GET /api/blood-report/compare?id1=X&id2=Y` — returns merged parameter diff table
- [x] **Frontend:** "Compare" button on History page → opens modal
- [x] **Frontend:** Table: Parameter | Report A value | Report B value | Change (↑↓ with color)

---

### Feature 3 — Health Score Card on Dashboard ⭐
**Component:** `HealthScoreCard.jsx`

- [x] **Backend:** `GET /api/blood-report/latest-score` — returns latest `risk_scores.composite_score` + `risk_level` for patient
- [x] **Frontend:** Card on PatientDashboard with circular SVG gauge (reuse the ring from Analysis.jsx)
- [x] **Frontend:** Show score history sparkline if multiple reports exist

---

### Feature 4 — Daily Personalized Health Tips ⭐
**Component:** `DailyTipsCard.jsx`

- [x] **Backend:** `GET /api/blood-report/daily-tips` — reads most recent report, calls LLM, returns 3 one-liner tips (≤20 words each). Cache for 24h per patient in memory or DB. Supports `?force=true` to bypass cache.
- [x] **Frontend:** Card on PatientDashboard: tip text + "Refresh" button (sends `?force=true` to regenerate)
- [x] Example tip: *"Your iron is low — try adding spinach or lentils to lunch today."*

---

## Phase 3 — ENGAGEMENT LOOPS

### Feature 5 — Parameter Progress Tracker
**Component:** `ParameterProgress.jsx` → add to Analysis page

- [ ] **Backend:** Extend `GET /api/blood-report/history` or new endpoint to return per-parameter history
- [ ] **Frontend:** For each abnormal parameter, horizontal gauge showing current value relative to normal range
  - Visual: `[Low ←――●――――→ High]` with patient's value as the marker dot
  - If multiple reports: show arrow indicating direction of change

---

### Feature 6 — Supplement / Recovery Ingredient Tracker
**Toggle added to Recovery Ingredients cards in Analysis.jsx**

- [ ] **DB:** New table `supplement_logs (id, patient_id, ingredient_name, taken_at)`
- [ ] **Backend:** `POST /api/patient/supplement-log` + `GET /api/patient/supplement-log?date=YYYY-MM-DD`
- [ ] **Frontend:** "✓ Taken today" toggle on each Recovery Ingredient card in Analysis.jsx
- [ ] **Frontend:** Show streak counter ("5-day streak 🔥") on the card

---

### Feature 7 — Smart Follow-up Email Reminders
**Background feature — no UI change needed**

- [ ] **DB:** New table `reminders (id, patient_id, report_id, message, send_at, sent BOOLEAN)`
- [ ] **Backend:** After `followUpAgent` saves results, parse recheck timeframes → insert rows into `reminders`
- [ ] **Backend:** Cron-style check (on server startup or periodic endpoint) — send emails for `send_at <= now AND sent = false`

---

### Feature 8 — Engagement Badges
**Added to PatientDashboard and/or Profile page**

| Badge | Condition |
|-------|-----------|
| 🩸 First Report | Has ≥1 analyzed report |
| 📈 On Track | Has ≥3 analyzed reports |
| ✅ Improving | Any parameter moved closer to normal range between last 2 reports |
| 🔁 Follow-up Champion | Uploaded a new report within the recommended recheck window |

- [ ] **Backend:** `GET /api/patient/badges` — compute badges from `blood_reports` table
- [ ] **Frontend:** Badge row on dashboard

---

### Feature 9 — Printable Patient-Friendly Summary Card

- [ ] **Backend:** `GET /api/blood-report/:id/summary-card` — generates minimal 1-page PDF: Health Score + top 3 findings in plain English + 3 foods to eat/avoid + next recheck date
- [ ] **Frontend:** "Print Summary Card" button in Analysis page header (next to Export PDF)

---

## Phase 4 — BACKGROUND / INFRASTRUCTURE

### Feature 10 — Vitals ↔ Blood Report Correlation
**Small insight banner in Vitals.jsx**

- [ ] **Backend:** `GET /api/patient/vitals/insights` — reads recent vitals + latest blood report, returns 1-2 sentence LLM-generated correlation
- [ ] **Frontend:** Add insight banner below each chart in Vitals.jsx
- [ ] Example: *"Your HbA1c was 7.2% last report — daily glucose readings of 140–160 mg/dL are consistent with this."*

---

## Revised Patient Navigation (after cleanup)

```
Dashboard
  ├── Upload Report        ← main CTA
  ├── My Reports           ← NEW (history + trends)
  ├── Vitals               ← keep + enhance
  ├── Profile
  └── Find a Lab / Clinic  ← renamed from Doctors
```

---

## Files Reference

### Delete
```
client/src/pages/Patient/Intake.jsx
client/src/pages/Patient/Results.jsx
client/src/pages/Patient/Tests.jsx
client/src/pages/Patient/Medications.jsx
client/src/pages/Patient/Appointments.jsx
client/src/pages/Patient/Prescriptions.jsx
client/src/pages/Patient/MedicalID.jsx
client/src/pages/Patient/HealthTimeline.jsx
client/src/components/VoiceIntake.jsx
server/routes/disease.js
server/agents/diagnosticAgent.js
server/routes/appointments.js
```

### Modify
```
client/src/App.jsx                             remove 8 routes, add /patient/history
client/src/components/Layout/Navbar.jsx        remove 6 links, add My Reports, rename Doctors
client/src/pages/Patient/PatientDashboard.jsx  remove session flow, keep report cards
client/src/pages/Patient/Analysis.jsx          remove doctor referral sections
client/src/pages/Patient/Doctors.jsx           re-label to Find a Lab / Clinic
server/index.js                                unregister disease + appointments routes
server/routes/patient.js                       remove medication/prescription/medical-id routes
server/routes/voice.js                         remove /parse route
server/routes/bloodReport.js                   add /history, /compare, /daily-tips, /summary-card, /latest-score
```

### Create
```
client/src/pages/Patient/ReportHistory.jsx     My Reports page
client/src/components/HealthScoreCard.jsx      Dashboard health score widget
client/src/components/DailyTipsCard.jsx        Personalized tips widget
client/src/components/ParameterProgress.jsx    Progress gauge for Analysis page
client/src/components/CompareModal.jsx         Side-by-side report comparison
```

---

## Progress Summary

| Phase | Tasks | Done |
|-------|-------|------|
| Phase 1 — Cleanup | 25 | 25 ✅ |
| Phase 2 — New core features | 12 | 12 ✅ |
| Phase 3 — Engagement loops | 14 | 0 |
| Phase 4 — Infrastructure | 3 | 0 |
| **Total** | **54** | **37** |

> Update checkboxes above as you complete each task. Update the counts in this table.
