# MedAssist — Project Refocus Plan
## Blood Report Analysis · Patient Engagement Roadmap

---

## Context

The project has grown to cover two journeys: (1) symptom-based disease diagnosis and (2) blood report analysis. The decision is to **drop the diagnosis journey entirely** and focus exclusively on blood report analysis. Patients upload a blood report, get AI-powered insights, and are guided toward healthier choices — we are not diagnosing diseases, we are helping patients understand their own lab results.

This plan identifies what to remove, what to keep, and what new features to add to make the blood-report experience richer and more engaging.

---

## Part 1 — IRRELEVANT FEATURES (remove or hide)

These features belong to the diagnosis journey or to the doctor-patient relationship, neither of which is the focus anymore.

### Pages to Remove (Patient side)
| Page | File | Why Irrelevant |
|------|------|---------------|
| Symptom Intake Wizard | `client/src/pages/Patient/Intake.jsx` | 3-step symptom form — only needed for disease diagnosis |
| Disease Results | `client/src/pages/Patient/Results.jsx` | Shows AI-predicted diseases from symptoms |
| Test Recommendations | `client/src/pages/Patient/Tests.jsx` | Recommends blood tests to confirm a predicted disease |
| Prescriptions | `client/src/pages/Patient/Prescriptions.jsx` | Doctor-issued prescriptions — doctor relationship feature |
| Appointments | `client/src/pages/Patient/Appointments.jsx` | Book doctor appointments — irrelevant if we're not being a doctor |
| Medications tracker | `client/src/pages/Patient/Medications.jsx` | Was built to track prescribed/recommended drugs — we're removing drug recommendations |
| Medical ID | `client/src/pages/Patient/MedicalID.jsx` | Emergency card — unrelated to blood report analysis |
| Health Timeline | `client/src/pages/Patient/HealthTimeline.jsx` | Mixes symptom sessions, vitals, appointments — most events won't exist after cleanup |

### Backend Routes / Agents to Remove
| Route / Agent | File | Why Irrelevant |
|--------------|------|---------------|
| `POST /api/disease/predict` | `server/routes/disease.js` | Entire diagnostic agent pipeline |
| `POST /api/disease/tests` | `server/routes/disease.js` | Test recommendations for a disease |
| `POST /api/appointments/*` | `server/routes/appointments.js` | Appointment booking system |
| `GET/POST /api/patient/prescriptions` | `server/routes/patient.js` | Prescription delivery to patient |
| `GET/POST /api/patient/medications` | `server/routes/patient.js` | Medication log and dose tracking |
| `PUT/DELETE /api/patient/medications/:id` | `server/routes/patient.js` | Medication management |
| `GET /api/patient/medications/sources` | `server/routes/patient.js` | Discovery endpoint for meds from prescriptions |
| `GET /api/patient/medical-id` | `server/routes/patient.js` | Emergency ID |
| `POST /api/voice/parse` | `server/routes/voice.js` | Intake wizard voice parsing — no longer needed |
| `diagnosticAgent.js` | `server/agents/diagnosticAgent.js` | Full symptom → disease prediction agent |
| `VoiceIntake.jsx` component | `client/src/components/VoiceIntake.jsx` | Only used in Intake wizard |

### Dashboard Cleanup
- Remove the "New Assessment" CTA button and the "In-Progress Sessions" section from `PatientDashboard.jsx` — these are session-based (diagnosis journey)
- Keep the "Direct Blood Report Analyses" section and the "Analyze Blood Report" quick-upload CTA
- Remove the progress bar showing `Symptoms → Diagnosed → Tests → Uploaded → Analyzed` from session cards (the session concept goes away)

### Analysis Page Cleanup
- Remove the Doctor Referral conditional section ("Professional Medical Consultation Required") — we are not diagnosing or recommending doctors
- Remove the "Looking for a doctor anyway?" CTA — same reason
- Remove the disease context line ("Context: {disease}") in the header — no disease-first flow
- Keep the **Doctors** page (`Doctors.jsx`) but **re-label it "Find a Lab / Clinic"** — useful for patients wanting to get follow-up tests done nearby, not for booking a physician

### DB Tables to Deprecate (no deletion, just stop using)
- `symptom_sessions` — no more symptom-based sessions
- `appointments` — booking removed
- `medication_logs` — medication tracking removed
- `doctor_assist_sessions` — doctor-side only
- `prescriptions` — doctor-side only
- `doctor_patients` / `patient_doctor_access` — doctor panel relationships

### Navbar Links to Remove (Patient nav)
- Medications
- Appointments
- Prescriptions
- Timeline (or repurpose — see below)
- Medical ID

---

## Part 2 — CORE FEATURES TO KEEP

These are the heart of the new focused experience.

| Feature | Where |
|---------|-------|
| Blood report upload (camera + file) | `UploadReport.jsx` |
| OCR extraction of lab values | `bloodReport.js` → upload route |
| AI analysis (summary, abnormal findings, diet, recovery) | `bloodReportAgent.js` |
| Clinical Risk Score (Framingham, FINDRISC, etc.) | `riskScoringAgent.js` |
| Follow-up schedule | `followUpAgent.js` |
| Abnormal finding explanation (? modal) | `voice.js` → explain-finding |
| Voice narration of full report | `voice.js` → narrate-report |
| Report chatbot (text + speech) | `ReportChatbot.jsx` + `voice.js` → report-chat |
| Export PDF | `bloodReport.js` → export-pdf |
| Share report (time-limited link) | `patient.js` → share + `SharedReport.jsx` |
| Patient profile (age, gender, conditions — used by AI for context) | `Profile.jsx` |
| Vitals tracker (BP, glucose, weight, SpO2) | `Vitals.jsx` — keep and EXPAND |
| Find a Lab / Clinic (renamed from Doctors) | `Doctors.jsx` — keep, re-label |

---

## Part 3 — NEW FEATURES TO ADD (Patient Engagement)

These are ordered by impact × effort, highest priority first.

---

### Feature 1 — Blood Report History & Trend Charts ⭐ (Highest Priority)
**What:** Show all past blood reports as a timeline. For key parameters (Hemoglobin, HbA1c, Cholesterol, Glucose, etc.), display a sparkline or trend chart showing how the value has changed across reports.  
**Why it matters:** Patients become engaged when they see progress. "Your hemoglobin improved from 9.2 → 11.4 in 3 months" is far more motivating than a single report.  
**New page:** `/patient/history` — "My Reports" with a timeline and parameter trend drawer  
**Backend needed:** `GET /api/blood-report/history` — returns all reports for the patient sorted by date, with extracted values  
**Frontend:** Line charts (already using Recharts in Vitals.jsx, reuse that pattern)  
**DB:** No schema change — just query `blood_reports` ordered by `created_at` for the patient  

---

### Feature 2 — Report Comparison (Side-by-Side) ⭐
**What:** Select any two past reports and see a diff table: parameter | Report A value | Report B value | Change (↑/↓ with color).  
**Why it matters:** Lets patients see exactly which parameters improved or worsened after a lifestyle change.  
**Where:** Button on the History page — "Compare with previous report"  
**Backend needed:** `GET /api/blood-report/compare?id1=X&id2=Y` — returns merged parameter table  
**Frontend:** New `CompareModal.jsx` or sub-section in History page  

---

### Feature 3 — Health Score Dashboard Card ⭐
**What:** On the patient dashboard, show a single "Health Score" number (0–100) derived from the most recent risk score composite, alongside a mini sparkline of how it's changed.  
**Why it matters:** One number patients can track. Like a credit score for health.  
**Where:** Add a card to `PatientDashboard.jsx` ("Your Latest Health Score")  
**Backend needed:** Read latest `blood_reports.risk_scores.composite_score` for the patient  
**Frontend:** Circular gauge (reuse the SVG ring from Analysis.jsx)  

---

### Feature 4 — Daily Health Tips (Personalized) ⭐
**What:** Based on the patient's most recent analysis, show 1–3 short personalized tips on the dashboard. Rotate daily (or on each login). E.g., "Your iron is low — try adding spinach or lentils to lunch today."  
**Why it matters:** Gives patients a reason to open the app every day.  
**New backend route:** `GET /api/blood-report/daily-tips` — picks the most recent analyzed report, asks the LLM to generate 3 fresh one-liner tips (max 20 words each), caches for 24 hours per patient  
**Frontend:** Small card on dashboard with a tip card + "Refresh tip" button  

---

### Feature 5 — Parameter Progress Tracker ⭐
**What:** For each abnormal parameter in the latest report, show a visual "progress bar" between where it is now and the normal range. If they've had multiple reports, show how close they've gotten.  
**Why it matters:** Makes improvement visible and motivating.  
**Where:** New "Progress" tab or card on the Analysis page  
**Backend needed:** Read historical `extracted_values` across multiple reports for the same patient  
**Frontend:** Horizontal gauge: `Abnormal ←―●―――――→ Normal Range` with their current value as the dot  

---

### Feature 6 — Supplement / Recovery Ingredient Tracker
**What:** For each recommended recovery ingredient, a simple "Did you take this today?" toggle that logs the date. After a week, shows a streak counter.  
**Why it matters:** Converts passive recommendations into active habits. Keeps patients coming back daily.  
**New table needed:** `supplement_logs (patient_id, ingredient_name, taken_at)`  
**New routes:** `POST /api/patient/supplement-log` + `GET /api/patient/supplement-log?date=today`  
**Frontend:** Add toggles to the Recovery Ingredients cards in Analysis.jsx  

---

### Feature 7 — Smart Follow-up Reminder (Email)
**What:** When the follow-up agent recommends "Recheck in 4 weeks," automatically schedule an email reminder to the patient for that date.  
**Why it matters:** Patients forget follow-ups. This closes the loop.  
**Backend:** After `followUpAgent` saves recommendations, store reminders in a `reminders` table with `send_at` timestamp. A cron job or scheduled check sends the email via the existing email system.  
**New table:** `reminders (patient_id, report_id, message, send_at, sent)`  
**No frontend change needed** — it's a background feature.  

---

### Feature 8 — Report Upload Streak / Engagement Badges
**What:** Show small achievement badges on the dashboard. E.g.:
- 🩸 "First Report" — uploaded first blood report
- 📈 "On Track" — uploaded 3+ reports
- ✅ "Improved" — any parameter moved closer to normal range between reports
- 🔁 "Follow-up Champion" — uploaded a follow-up report within the recommended window
**Why it matters:** Gamification creates intrinsic motivation to return.  
**Backend:** Simple badge-calculation logic based on existing `blood_reports` table  
**Frontend:** Small badge row on dashboard / profile page  

---

### Feature 9 — Printable Patient-Friendly Summary Card
**What:** A one-page, consumer-friendly PDF with: Health Score, top 3 findings in plain English, 3 foods to eat, 3 foods to avoid, next recheck date. Designed to hand to a doctor or stick on a fridge.  
**Why it matters:** Bridges the app to the physical world. Different from the full "Export PDF."  
**New route:** `GET /api/blood-report/:id/summary-card` — generates a minimal, styled PDF  
**Frontend:** Button in Analysis header: "Print Summary Card"  

---

### Feature 10 — Vitals ↔ Blood Report Correlation
**What:** In the Vitals page, after a patient records blood glucose, check their latest blood report and show: "Your HbA1c was 7.2% — your daily readings of 140–160 mg/dL are consistent with this."  
**Why it matters:** Connects daily vitals tracking to lab results, making both features more meaningful.  
**Backend:** New endpoint `GET /api/patient/vitals/insights` — reads recent vitals + latest blood report, returns a 1-2 sentence correlation via LLM  
**Frontend:** Add a small "Insights" banner below the Vitals chart  

---

## Part 4 — REVISED PATIENT NAVIGATION (after cleanup)

```
Dashboard
├── Upload Report          (main CTA — quick path)
├── My Reports             (NEW — history + trends)
├── Vitals                 (keep + enhance)
├── Profile
└── Find a Lab / Clinic    (renamed from Doctors)
```

Routes to remove from navbar: Intake, Results, Tests, Medications, Appointments, Prescriptions, Timeline, Medical ID  
Routes to add: `/patient/history` (My Reports)

---

## Part 5 — IMPLEMENTATION PRIORITY

### Step 0 — Create Project ROADMAP.md (do this first)
Write the full contents of this plan to `C:\prsnl_doc\CS595\Project\medassist\ROADMAP.md` so it lives in the project repo, is git-tracked, and survives session expiry or account switches. Include progress checkboxes so status can be updated after each phase.

### Phase 1 — Cleanup (Remove irrelevant features)
1. Remove pages: Intake, Results, Tests, Medications, Appointments, Prescriptions, MedicalID, Timeline
2. Remove routes from App.jsx and Navbar
3. Clean up PatientDashboard — remove session flow cards, keep standalone report cards
4. Clean up Analysis.jsx — remove doctor referral section and disease context
5. Rename "Doctors" to "Find a Lab / Clinic" 

### Phase 2 — Core New Features (High engagement value)
1. **My Reports / History page** — `/patient/history` with trend charts (Feature 1)
2. **Health Score card** on dashboard (Feature 3)
3. **Daily Health Tips** card on dashboard (Feature 4)
4. **Report Comparison** modal (Feature 2)

### Phase 3 — Engagement Loops
1. **Parameter Progress Tracker** in Analysis page (Feature 5)
2. **Supplement Tracker** toggles in Recovery Ingredients (Feature 6)
3. **Badges** on dashboard (Feature 8)
4. **Printable Summary Card** (Feature 9)

### Phase 4 — Background / Infrastructure
1. **Email reminders** for follow-ups (Feature 7)
2. **Vitals ↔ Blood Report correlation** (Feature 10)

---

## Part 6 — FILES TO MODIFY / CREATE

### Delete (or archive)
- `client/src/pages/Patient/Intake.jsx`
- `client/src/pages/Patient/Results.jsx`
- `client/src/pages/Patient/Tests.jsx`
- `client/src/pages/Patient/Medications.jsx`
- `client/src/pages/Patient/Appointments.jsx`
- `client/src/pages/Patient/Prescriptions.jsx`
- `client/src/pages/Patient/MedicalID.jsx`
- `client/src/pages/Patient/HealthTimeline.jsx`
- `client/src/components/VoiceIntake.jsx`
- `server/routes/disease.js`
- `server/agents/diagnosticAgent.js`

### Modify
- `client/src/App.jsx` — remove 8 patient routes, add `/patient/history`
- `client/src/components/Layout/Navbar.jsx` — remove 6 nav links, add "My Reports"
- `client/src/pages/Patient/PatientDashboard.jsx` — remove session flow, keep standalone reports
- `client/src/pages/Patient/Analysis.jsx` — remove doctor referral sections
- `client/src/pages/Patient/Doctors.jsx` — re-label to "Find a Lab / Clinic"
- `server/index.js` — unregister disease route

### Create (New features)
- `client/src/pages/Patient/ReportHistory.jsx` — My Reports page with trend charts
- `client/src/components/HealthScoreCard.jsx` — Health score widget for dashboard
- `client/src/components/DailyTipsCard.jsx` — Personalized tips widget
- `client/src/components/ParameterProgress.jsx` — Progress bar component for Analysis page
- `client/src/components/CompareModal.jsx` — Side-by-side report comparison
- `server/routes/bloodReport.js` additions — `/history`, `/compare`, `/daily-tips`, `/summary-card`

---

## Verification

After implementation, the patient journey should be:
1. Land on Dashboard → see Health Score + Daily Tip + past reports
2. Upload a new blood report → OCR extracts values
3. View Analysis page → abnormal findings + diet + risk score + follow-up
4. Interact with chatbot / listen to narration / click ? to explain findings
5. Visit My Reports → see trend charts showing improvement over time
6. Track supplement intake and vitals
7. Receive email reminder when follow-up test is due
