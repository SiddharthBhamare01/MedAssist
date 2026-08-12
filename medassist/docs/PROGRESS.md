# MedAssist — Progress Tracker

Mapped to the v3 work plan (*The Anemia Intelligence Module · Detect → Confirm & Track → Prove & Position*).
Last updated: 2026-08-06.

---

## ✅ Done

### Infrastructure / reliability (pre-Stage-1)
- Blood-report OCR restored — refreshed to current 2026 vision model IDs (Gemini 3.x / Qwen 3.7 via OpenRouter).
- AI provider failover hardened — 402/404 handling, Cerebras promoted to `gpt-oss-120b`.

### Stage 1 — CBC Expert Module (Month 1, "Detect") — **✅ COMPLETE**
- **Deterministic anemia engine** (`server/services/anemiaClassifier.js`): rule-based status, WHO 2024 cutoffs, WHO 2011 severity bands, MCV/MCH/RDW morphology, AGA 2020 iron-deficiency confirmation, conservative deferral. *The AI only explains; the rule engine decides.*
- **Shared reference-range table** (`server/data/referenceRanges.js`) — single source of truth; added MCH & RDW.
- **Deterministic status recompute** wired into upload (`routes/bloodReport.js`) — CBC statuses computed by rule, not the OCR LLM.
- **Agent integration** — `bloodReportAgent` injects the authoritative determination into the LLM prompts and persists `analysis.anemia`; `riskScoringAgent` Hematological dimension anchored to rule-based severity.
- **Age- & sex-adjusted ranges** — WHO 2024 pediatric/adult hemoglobin bands (infant → adolescent → adult), age-adjusted microcytosis threshold, pregnancy-aware severity scale.
- **Pregnancy flag** — migration + profile field (drives the correct WHO cutoff/scale).
- **Symptom logging** — patients log anemia symptoms per report over time (Anemia Mode dashboard, `anemia_symptom_logs` table + API + `SymptomLogger` UI).
- **Frontend "Anemia Mode"** — `client/src/components/AnemiaCard.jsx` renders status/severity/morphology/confidence, Hb-vs-cutoff, recommendation, deferral banner, and source citations.
- **Validation harness** — 28 synthetic CBCs + confusion matrix (see [CHECKPOINT-01](./CHECKPOINT-01-cbc-expert.md)). Result: 100% sensitivity/specificity, 0 false negatives.
- **Risk score made trustworthy** — overall risk now derived by RULE from anemia severity (moderate → 60/High, never diluted to "Low"); empty organ dimensions hidden; in-app "How reliable is this?" validation panel (sensitivity/specificity + WHO/AGA sources) on the Anemia card.

### Stage 2 — Confirm & Track (Month 2) — **🔄 IN PROGRESS** · Sprint 4 ✅ COMPLETE

*Work-plan Sprint 4 (Weeks 7–8, Aug 4–15) — Recovery Trajectory + Forecast. Full write-up:
[CHECKPOINT-03](./CHECKPOINT-03-recovery-journey.md).*

- **Pillar 1 — Hb recovery trajectory — ✅ DONE.**
  - `GET /api/blood-report/trajectory` (`routes/bloodReport.js`) — hemoglobin-vs-date series from
    `analysis.anemia.hemoglobin.{value,cutoff,applied_cutoff_basis}` + `status`/`severity`, ordered by
    `created_at`. Falls back to `readNumeric(extracted_values, 'hemoglobin')` so pre-classifier reports
    still plot (13 of 27 rows on the test account). Deliberately does **not** filter `session_id IS NULL`
    — a recovery journey spans every CBC the patient uploaded. Read-only; no migration.
  - Returns `baseline` / `latest` / `delta` / `days_elapsed` plus a `cutoff` anchored to the most recent
    known cutoff and a `mixed_basis` flag — the WHO cutoff is **not** constant across a patient's history
    (pregnancy toggled, age crossing a band), so the chart never draws one line over points measured
    against another.
  - `client/src/pages/Patient/AnemiaJourney.jsx` at `/patient/journey` — Recharts `LineChart` with a
    dashed `ReferenceLine` at the personalized cutoff, dots colored by rule-computed status, a
    baseline→latest strip, a mixed-cutoff notice, and a "Where do these numbers come from?" panel.
    Three deliberate states: 0 reports, 1 report (single reading + CTA — the common case), 2+ (chart).
  - `client/src/data/anemiaLabels.js` — `STATUS_STYLE` / `SEVERITY_STYLE` / `BASIS_LABEL` extracted from
    `AnemiaCard` so both surfaces label and color a status identically.
  - Nav entry (`nav.journey`, `Icons.beaker`), route in `App.jsx`, `journey.*` strings in **en + es**,
    and a discovery link on `Analysis.jsx` gated on `anemia.anemia_present`.
  - *Display-only by design: it plots values the validated rule engine already computed. No forecast,
    no trend verdict, no causation claim.*
- **Pillar 2 — recovery forecast + non-responder flag — ✅ DONE.**
  - `server/services/recoveryForecast.js` — pure, source-cited, no LLM. Produces `trend`
    (improving/stable/worsening, ±0.5 g/dL dead band for assay noise) and `responder_status`:
    `RECOVERED` · `RESPONDING` · `NOT_RESPONDING` · `TOO_EARLY` · `INTERVAL_TOO_LONG` ·
    `NOT_APPLICABLE` · `INSUFFICIENT_DATA`. Forecast = ≈1 g/dL/week to the WHO target.
  - **Episode anchoring.** The baseline is the first anemic reading of the *current* episode, not
    the oldest anemic reading on file. Anchoring to the latter makes a relapse read backwards: on
    real dev data (Jul 27 Hb 15.0 → Aug 2 Hb 10.2) a naive baseline turns a 4.8 g/dL fall in six
    days into a "+2.0 g/dL rise, normal in ~3 weeks." The live endpoint now returns
    `NEW_EPISODE` + physician review on that patient.
  - **The forecast is withheld far more than it is offered** (21 of 30 fixtures). Hard preconditions:
    iron-deficiency type, hemoglobin not falling, cutoff not moved (`mixed_basis`), still below
    target, and a responder status of `RESPONDING`/`TOO_EARLY`.
  - **The responder check is bounded to a 14–90 day interval.** Day 14 is a specific clinical
    checkpoint; at 6 months the 1 g/dL bar tests nothing, and the app cannot observe whether iron
    was ever taken — so outside the window it reports trend only, and inside it the flag is worded
    conditionally ("if you have been taking iron…") rather than asserting a failed response.
  - Harness `server/tests/recovery/runForecast.js` — **30 synthetic journeys, 0 missed
    non-responders, 0 unsupportable forecasts, 97/97 field accuracy**. Reports refusal discipline,
    not sensitivity/specificity (this is not a binary classifier). Both safety gates were
    negative-control tested: disabling the falling-hemoglobin guard makes it fail and exit 1.
  - Frontend: a recovery verdict card (status, trend, conditional non-responder alert reusing the
    deferral-banner pattern) + a dashed projection line on the chart, shown only when the engine
    offered one. `client/src/data/recoveryValidation.js` mirrors the harness output.
- **UI pass — ✅ DONE** (same day, from review of the rendered page).
  - Trajectory moved **inline** on the analysis page at full width — a click-through buried the
    point of the feature. Extracted to `components/RecoveryJourneyCard.jsx`; `/patient/journey` is
    now a thin wrapper over the same component.
  - Sections **reordered by clinical importance**: Anemia Assessment → Risk Score → Abnormal
    Findings → Recovery Assessment + chart → Parameter Progress → Follow-up ‖ Symptom Logger →
    Diet Plan ▸ ‖ Recovery Ingredients ▸.
  - Diet Plan and Recovery Ingredients **collapse** (native `<details>` via a `collapsible` prop on
    `Section`, closed by default); Follow-up and Symptom Logger paired in one row.
  - **Overall Summary merged into the Anemia card** — the two restated the same conclusion on a
    CBC. The standalone summary card still renders when the anemia card is absent (non-CBC
    reports), so the summary appears exactly once.
  - **`NEW_EPISODE` status added** — a relapse previously read as `INSUFFICIENT_DATA`, which looks
    like missing data when 27 reports are on file.
  - **"Educational use only" banner removed** from the analysis header (requested). It was the only
    in-app disclaimer; the exported PDF still carries it. See the ⚠️ note in CHECKPOINT-03.

---

## 🔧 In progress / next

- **⚠️ Visual verification of the whole recovery journey UI** — chart, cutoff line, recovery card,
  collapse behavior, section order, merged anemia card. All verified by harness/build/live API, none
  seen rendered. The `RESPONDING`/`RECOVERED` states and the dashed projection line need a patient
  with two iron-deficiency CBCs 2–4 weeks apart to exercise at all.
- **Live integration test** — upload real anemic CBCs end-to-end on the deployed app; confirm `analysis.anemia` renders and risk score is anchored.
- **Spanish parity** — `AnemiaCard` still has hard-coded English strings (the `journey.*` namespace is at full en/es parity, 45 keys each).

## ⏭ Next stages (roadmap in [CHECKPOINT-02](./CHECKPOINT-02-roadmap.md))
- **Phase 2 remainder** (optional, beyond Sprint 4): unified journey timeline (Pillar 3), reminders/nudges (Pillar 4).
- **Phase 3 — Prove & Position** (Month 3, Sprints 5–6): safety/critical-value net, in-app validation dashboard, clinician-review workflow, positioning brief, capstone walkthrough.

## ⚠️ Gate 3 is earlier than the work plan assumes

Per `LOF_LABS_Participant_Guide.docx`, **Gate 3 (feature-complete beta) is due end of Week 10,
~6 Sep** — not 30 Sep. The Month 3 plan is ~3 weeks late against the actual gate. Reconcile
this before scheduling Sprint 5/6 work. Full detail in
[CHECKPOINT-04](./CHECKPOINT-04-voice-safety-compliance.md) §7.

> **Resume point:** [CHECKPOINT-04-voice-safety-compliance.md](./CHECKPOINT-04-voice-safety-compliance.md) — most recent.
> Carries the voice pipeline rebuild, the chatbot treatment guardrail, licensing compliance,
> the Gate 2 self-assessment, and the open credential/compliance checklist.
> [CHECKPOINT-03](./CHECKPOINT-03-recovery-journey.md) has the recovery journey;
> [CHECKPOINT-02](./CHECKPOINT-02-roadmap.md) the Phase 1 recap + Phase 2/3 build order;
> [CHECKPOINT-01](./CHECKPOINT-01-cbc-expert.md) the anemia classifier.
