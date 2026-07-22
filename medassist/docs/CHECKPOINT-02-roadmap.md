# Checkpoint 02 — Phase Roadmap (resume-from-here)

A resume point: what Phase 1 delivered (done + deployed) and the concrete plan for Phases 2 & 3.
Plan arc = **Detect → Confirm & Track → Prove & Position** (v3 work plan, 3 months).

---

## ✅ PHASE 1 — CBC Expert Module ("Detect") — COMPLETE & DEPLOYED on `main`

A deterministic, source-cited anemia engine. **The rule engine decides; the LLM only explains.**

### What was built
- **Deterministic classifier** — `server/services/anemiaClassifier.js`
  - WHO 2024 hemoglobin cutoffs, **age + sex + pregnancy adjusted** (infant → child → adolescent → adult).
  - WHO 2011 severity bands (age-aware lower scale); MCV/MCH/RDW morphology (age-adjusted microcytosis threshold).
  - AGA 2020 iron-deficiency confirmation (ferritin <45 / TSAT <20) → `CONFIRMED` / `SUSPECTED` / `INCONCLUSIVE` / `NOT_ANEMIC`.
  - Conservative deferral; every result carries `sources[]` + an `explanation_seed` the LLM must explain, not alter.
  - Exports: `classifyAnemia`, `recomputeStatuses`, `statusByRule`, `canonicalKey`.
- **Shared range table** — `server/data/referenceRanges.js` (extracted from `medicalTools.js`, +MCH/RDW, parser/resolver).
- **Pipeline integration** — statuses recomputed by rule at upload (`routes/bloodReport.js`); determination injected into Phase 2a/2b prompts and persisted as `analysis.anemia` (`agents/bloodReportAgent.js`).
- **Deterministic risk score** — `agents/riskScoringAgent.js`: overall risk derived by RULE from anemia severity (moderate→60/High, never diluted to "Low"); empty organ tiles hidden; `rule_based` flag.
- **Frontend** — `client/src/components/AnemiaCard.jsx` (status/severity/morphology, Hb-vs-cutoff, recommendation, deferral banner, sources, collapsible "How reliable is this?" panel), `SymptomLogger.jsx` (per-report daily symptom logging), `data/anemiaValidation.js`, "✓ Validated" badge on the Risk Score section (`pages/Patient/Analysis.jsx`).
- **Pregnancy flag** (`migration 005`) + **symptom logs** (`migration 006`, `anemia_symptom_logs`, `GET/POST /blood-report/:id/symptoms`). Both auto-applied by `db/migrate.js` on startup.
- **Validation harness** — `server/tests/anemia/{fixtures,runClassifier}.js`: **28 synthetic CBCs → 100% sensitivity/specificity, 0 false negatives**, confusion matrix + per-severity/morphology/status tables. Run: `node medassist/server/tests/anemia/runClassifier.js`.
- **Docs** — `docs/PROGRESS.md`, `docs/CHECKPOINT-01-cbc-expert.md`.

### Key commits (branch `main`)
OCR model fix → `dcfb270`; provider 402 failover + Cerebras → `8fded1f`/`6014442`; anemia module merge → `cfcec93`; text-PDF 402/404 → `8472194`; deterministic risk + panel → `9f6aae6`; validated badge → `691a5a5`; age-adjust + symptom logging → `3d31a1f`.

### Demo test files
`sample-cbc-reports/CBC_{1_iron_deficiency,2_normal,3_macrocytic}.pdf` (text PDFs — fast extraction, no vision-OCR quota). Set the patient's profile gender/age first (drives the cutoff).

---

## 🔜 PHASE 2 — "Confirm & Track" (the recovery journey) — NEXT

**Goal:** turn single-report analysis into a longitudinal recovery story. Reuse existing infra —
Recharts is installed; `/blood-report/history` already returns per-report `extracted_values` + `created_at`;
`ReportHistory.jsx`/`Vitals.jsx` have Recharts `LineChart` templates; symptom logs + supplement streaks exist.

**Recommended build order (pillars):**

1. **Hb recovery-trajectory chart** *(quick, high-impact)*
   - Backend: new `GET /blood-report/trajectory` — Hb-vs-date series from each report's `analysis.anemia.hemoglobin.{value,cutoff}` + `status`/`severity`, ordered by `created_at`. **Include session-linked reports** (current trend endpoints filter `session_id IS NULL` — relax). Baseline = earliest report.
   - Frontend: Recharts `LineChart` on the Journey page — Hb line, `ReferenceLine` at the personalized WHO cutoff, dots colored by status (red=anemic, green=recovered). Copy the `Vitals.jsx` setup.

2. **Recovery forecast + non-responder flag** *(the novel clinical piece; deterministic + validated, like the classifier)*
   - New `server/services/recoveryForecast.js` (pure fns): from baseline Hb + anemia type, project **~1 g/dL/week** (iron-deficiency), estimate date-to-normal, and flag **non-responder** if observed rise <1 g/dL at ~2 weeks (day-14 responder threshold). Sources: Am J Medicine 5-trial analysis; Medscape IDA. **Only forecast for iron-deficiency**; stay conservative for B12/folate/ACD.
   - New harness `server/tests/recovery/` (mirror `tests/anemia/`) — synthetic multi-report journeys assert forecast + responder classification.
   - Frontend: dashed forecast line + target band; a non-responder alert card (reuse the red deferral-banner pattern).

3. **Unified journey timeline** *(the story)*
   - New page `client/src/pages/Patient/AnemiaJourney.jsx` at `/patient/journey`; route in `App.jsx`; nav entry in `Navbar.jsx` (unused `heart` icon; add `nav.journey` to `locales/en.json` + `es.json`).
   - Chronological feed merging report uploads (Hb/status), `anemia_symptom_logs`, supplement adherence (`/patient/supplement-log`). Backend: small `GET /blood-report/journey` aggregator or compose client-side.
   - Reuse the `Section` header pattern, teal/slate palette, `Chip`.

4. **Automated reminders/nudges** *(optional; infra work)*
   - Extend `reminders` (add `type` + recurrence; make `report_id` nullable) via a `db/migrate.js` migration.
   - Daily symptom-log nudge + recheck-CBC reminder; `reminderService.js` loop + `emailService.js` already deliver. Add recurrence/re-insertion logic.

---

## 🔮 PHASE 3 — "Prove & Position" — LATER

- **Expanded validation** — grow the synthetic set; surface the confusion matrix in-app (a `/methodology` page/dashboard) beyond the per-card panel; keep the 0-false-negative gate.
- **Clinician review workflow** — let a doctor review/annotate an anemia determination and capture feedback (new table + doctor-side UI); define how feedback is acted upon.
- **Safety net everywhere** — audit that critical-value alerts, confidence, and deferral run under every step.
- **Positioning brief + demo polish** — pre-visit report sections/caveats, deployment hardening, end-to-end walkthrough.

---

## How to resume
1. `node medassist/server/tests/anemia/runClassifier.js` → confirm 28/28, 0 FN (baseline still green).
2. Confirm `main` is deployed (Render log shows `patient_profiles.pregnant` + `anemia_symptom_logs`).
3. Start Phase 2, Pillar 1 (trajectory endpoint + chart) — smallest, unlocks the visual.
4. Then Pillar 2 (forecast + harness), Pillar 3 (journey page), Pillar 4 (reminders) if desired.

## Critical files (Phase 2)
- New: `server/services/recoveryForecast.js`, `server/tests/recovery/*`, `client/src/pages/Patient/AnemiaJourney.jsx`.
- Modify: `server/routes/bloodReport.js` (trajectory/journey endpoints), `client/src/App.jsx` (route), `client/src/components/Layout/Navbar.jsx` (nav), `locales/en.json`+`es.json`.
- Reuse: `analysis.anemia` shape, `/blood-report/history`, `Vitals.jsx`/`ReportHistory.jsx` Recharts patterns, `SymptomLogger`/supplement-streak precedents, `Section` header + `Chip`.

## Verification (Phase 2, when built)
- Unit: `node medassist/server/tests/recovery/runForecast.js` → forecast + non-responder assertions pass.
- Integration: upload 2–3 CBCs for one patient over (simulated) time → `/patient/journey` renders the Hb trajectory with cutoff line, the forecast, and a merged timeline; a declining/flat Hb triggers the non-responder alert.
