# MedAssist — Progress Tracker

Mapped to the v3 work plan (*The Anemia Intelligence Module · Detect → Confirm & Track → Prove & Position*).
Last updated: 2026-08-24 (round 2).

---

## ✅ Done

### Phase 2 faculty review — round 2 (24 Aug, [CHECKPOINT-07](./CHECKPOINT-07-phase2-review-round-2.md))

Six of the nine items left open by CHECKPOINT-06. **Running total: 8 of 13 review items closed,
2 partly closed, 3 open.**

- **Condition inference reframed — the SaMD item.** `/api/disease/predict` returned the top 5
  *most likely diseases* ranked by an integer `probability` with ICD-10 codes. It now returns
  conditions a clinician would want to rule out, **ordered alphabetically**, each with
  `clinician_questions` and `how_it_is_ruled_out`, plus a top-level not-a-diagnosis disclaimer.
  Likelihood fields are stripped deterministically and likelihood prose is dropped sentence by
  sentence. No frontend consumes this endpoint, so nothing broke.
- **Reference ranges from the patient's own report** — new `resolveEffectiveRange()`; the printed
  range wins, the curated table is the disclosed fallback (`range_source`). Critical thresholds
  stay on the table (safety limits, not assay bands); transposed/garbled ranges are rejected; WHO
  anemia cutoffs untouched. **7 new fixtures** — the existing 29 omit `normal_range` and would have
  passed without testing a line of it.
- **Inter-provider disagreement is measured** — new `utils/ensembleMetrics.js`, logged on every
  multi-provider run. Returns `null` rather than 0% when only one provider ran. ⚠️ The *instrument*
  exists; the production number is still uncollected.
- **Interaction alerts scoped** — 8-entry curated set; RxNorm results forced to `not_graded` with
  the limitation disclosed. Two rules enforced by test: no entry may advise stopping a medicine,
  and curated alerting stays **disabled** until a pharmacist signs off.
- **Association-not-causation disclaimer** on every recovery result; one treatment-presuming
  recommendation reworded.
- **Week 7 documents** — [SAMD-POSTURE-MEMO](./SAMD-POSTURE-MEMO.md) and
  [PHI-DATA-FLOW](./PHI-DATA-FLOW.md). The latter names two under-discussed flows: the whole report
  image goes to OCR with any printed identifiers, and Helicone proxies every model call.
- **OCR accuracy harness built** (`tests/ocr/`) with labelling format and fabrication count.
  ⚠️ **The 100 photographs must be produced by hand** — the harness exits 2 rather than fake a pass.
- `npm run test:offline` runs six suites: 29 + 7 + 29 + 30 + 16 + 16 + 21, all green.
- **OCR fabrication gate** (24 Aug) — see "In progress / next" for the three layers now in place.

### Phase 2 faculty review — first four fixes (24 Aug, [CHECKPOINT-06](./CHECKPOINT-06-phase2-review-quick-fixes.md))

Responding to `MedAssist_AI_Phase2_Review_Dr. Leibovitz's.docx`. Full item-by-item
analysis of all 13 review points in
[`MedAssist_AI_Phase2_Review_Response_Analysis.md`](../../MedAssist_AI_Phase2_Review_Response_Analysis.md).

- **Dietary-guidance gate — a live safety defect, now closed at the rule engine.** A microcytic
  anemia with no iron studies was typed `iron_deficiency` and drove an iron-themed diet plan; the
  review's point is that this can delay the workup for occult blood loss. `dietary_guidance`
  (`condition_specific` | `general_only`), `dietary_guidance_reason` and `clinician_questions` are
  now set on every classifier branch, and **only a `CONFIRMED` determination unlocks targeted
  nutrition**. Gated paths force a doctor referral. Deterministic backstop in `bloodReportAgent`
  empties `recovery_ingredients` rather than trusting the prompt. Extended past the review's ask to
  macrocytic and normocytic anemia. Harness: 29 cases (new `GATE-hb91-no-iron-panel` reproduces the
  reviewed scenario), 100% sensitivity/specificity held, field accuracy 151/151.
  ⚠️ **Backend only — no UI renders the reason or the questions yet.**
- **Four unearned clinical instruments removed** — `riskScoringAgent` told the model to score
  `Framingham-based`, `FINDRISC-based`, `CKD-EPI-based` and `Child-Pugh-based` risk without ever
  collecting BP, smoking status, treatment status or clinical findings. Labels replaced with the
  inputs we actually have, plus an explicit prohibition on naming any published instrument.
  Dimension names left byte-identical so `applyDeterministicRisk` still matches.
- **Vendor terms manifest** — `THIRD-PARTY-LICENSES.md` hosted-services section rewritten from one
  sentence into an eleven-row table (service, use, report data sent, terms to confirm), plus an
  explicit BAA/de-identification gap statement and infrastructure subprocessors. **Groq was missing
  entirely** despite being the lead provider; retired GitHub Models was still listed. Edited
  `scripts/license-manifest.js`, which generates that section — a hand edit would have been wiped.
- **`sample-cbc-reports/` was untracked but not ignored** — one `git add .` from committing lab
  PDFs. Now in `.gitignore`. ⚠️ 33 tracked image files still need auditing.

### Infrastructure / reliability (pre-Stage-1)
- Blood-report OCR restored — refreshed to current 2026 vision model IDs (Gemini 3.x / Qwen 3.7 via OpenRouter).
- AI provider failover hardened — 402/404 handling, Cerebras promoted to `gpt-oss-120b`.
- **Blood-report analysis failover fixed** (13 Aug, [CHECKPOINT-05](./CHECKPOINT-05-ensemble-failover.md)) — the
  ensemble narrowed its provider list to two *before* calling any of them, so two exhausted free tiers
  killed the whole analysis phase while healthy providers went untried. GitHub Models is retired (HTTP 410)
  and is out of every priority order.
- **Groq added as the lead free provider** (13 Aug, [CHECKPOINT-05](./CHECKPOINT-05-ensemble-failover.md) §6e)
  — ensemble agents went from 60–120s to **1.5s**. A model-ID audit found nothing outdated:
  SambaNova's 402 is `balance_units: 0` across all three keys and all six models, so no model
  change can fix it. ⚠️ Needs `GROQ_API_KEY` and `CEREBRAS_API_KEY` set in the Render dashboard —
  until then production runs on OpenRouter alone, slowly and with nothing cross-checked.

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

- **⚠️ Every safeguard added is backend-only** — the dietary gate's reason and questions,
  `range_source` disclosure, the symptom-flagging disclaimer, the association-not-causation notice
  and the interaction disclosure are all persisted and none is rendered. This is now the single
  largest gap between what the system enforces and what a patient sees. `Analysis.jsx` and
  `AnemiaCard.jsx` are the surfaces. [CHECKPOINT-07](./CHECKPOINT-07-phase2-review-round-2.md).
- **⚠️ Three of thirteen review items still open** — deterministic parsing + LOINC/UCUM (1–2 weeks),
  the 100-photograph OCR set (**harness built, photographs must be collected by hand**), and the
  pre-visit report / FHIR bundle (**the Gate 3 dependency**). BAAs and pharmacist review are
  documented but need people, not code. Detail in
  [CHECKPOINT-07](./CHECKPOINT-07-phase2-review-round-2.md).
- **⚠️ Production disagreement rate uncollected** — `utils/ensembleMetrics.js` logs it on every
  multi-provider run, but nobody has gathered a sample. Cheapest remaining item, and if the
  providers agree it justifies cutting the fan-out on cost, latency *and* PHI exposure at once.
- **⚠️ Vision OCR fabrication — gated, not yet proven fixed at the model.** A blank PNG returned a
  full set of invented results copied from the few-shot example in the prompt, and the
  deterministic classifier then built a confident anemia verdict on them. Three layers now stand
  between that and the patient (24 Aug): the prompts carry placeholders instead of plantable
  numbers plus an explicit "return [] if unreadable" rule; `utils/extractionValidator.js` refuses
  empty, numberless, prompt-echoing, placeholder-padded and single-bare-number extractions; and
  `POST /blood-report/upload` returns **422 with an actionable message instead of persisting**.
  21/21 in `tests/ocr/runValidator.js`. ⚠️ **The gate is verified against synthetic output only** —
  whether the vision model now returns `[]` for a genuinely blurred photograph is unmeasured and
  needs the OCR photo set. The gate holds either way; it does not depend on the model obeying.
  Detail in [CHECKPOINT-05](./CHECKPOINT-05-ensemble-failover.md) §6b.
- **⚠️ Visual verification of the whole recovery journey UI** — chart, cutoff line, recovery card,
  collapse behavior, section order, merged anemia card. All verified by harness/build/live API, none
  seen rendered. The `RESPONDING`/`RECOVERED` states and the dashed projection line need a patient
  with two iron-deficiency CBCs 2–4 weeks apart to exercise at all.
- **Live integration test** — upload real anemic CBCs end-to-end on the deployed app; confirm `analysis.anemia` renders and risk score is anchored.
- **Spanish parity** — `AnemiaCard` still has hard-coded English strings (the `journey.*` namespace is at full en/es parity, 45 keys each).

## ⏭ Next stages (roadmap in [CHECKPOINT-02](./CHECKPOINT-02-roadmap.md))
- **Phase 2 remainder** (optional, beyond Sprint 4): unified journey timeline (Pillar 3), reminders/nudges (Pillar 4).
- **Phase 3 — Prove & Position** (Month 3, Sprints 5–6): safety/critical-value net, in-app validation dashboard, clinician-review workflow, positioning brief, capstone walkthrough.

## ⚠️ Gate 3 is earlier than the work plan assumes — and now has a missing dependency

Per `LOF_LABS_Participant_Guide.docx`, **Gate 3 (feature-complete beta) is due end of Week 10,
~6 Sep** — not 30 Sep. The Month 3 plan is ~3 weeks late against the actual gate. Reconcile
this before scheduling Sprint 5/6 work. Full detail in
[CHECKPOINT-04](./CHECKPOINT-04-voice-safety-compliance.md) §7.

**Compounding this:** the Phase 2 review sets Gate 3 as "report upload through **pre-visit PDF**
end to end, including failure paths." No pre-visit report exists — nor does adherence tracking,
prescription OCR, or the effectiveness scoring the review describes in the present tense. The
review is grading the Phase 2 *proposal*, not the repository. Raise the gap with the professor
now rather than at the gate.

> **Resume point:** [CHECKPOINT-07-phase2-review-round-2.md](./CHECKPOINT-07-phase2-review-round-2.md) — **2026-08-24**, most recent.
> Carries the SaMD reframe of the symptom endpoint, report-printed reference ranges, the ensemble
> disagreement metric, the curated interaction set, the association disclaimer, and the two Week 7
> memos. Records the three items that cannot be closed by writing code.
> [CHECKPOINT-06](./CHECKPOINT-06-phase2-review-quick-fixes.md) — **2026-08-24** —
> carries the dietary-guidance gate (a live safety defect closed at the rule engine), removal of
> four unearned clinical-instrument names, the vendor terms manifest, and repo hygiene.
> [CHECKPOINT-05](./CHECKPOINT-05-ensemble-failover.md) — **2026-08-13** —
> carries the blood-report ensemble failover fix, the measured provider state, and two
> deliberate degradations (single-provider analysis on Render; a consensus judge that is
> not independent when OpenAI is down).
> [CHECKPOINT-04](./CHECKPOINT-04-voice-safety-compliance.md) — **2026-08-11** — has the voice
> pipeline rebuild, the chatbot treatment guardrail, licensing compliance, the Gate 2
> self-assessment, and the open credential/compliance checklist;
> [CHECKPOINT-03](./CHECKPOINT-03-recovery-journey.md) has the recovery journey;
> the full 13-item Phase 2 review analysis lives at
> [`MedAssist_AI_Phase2_Review_Response_Analysis.md`](../../MedAssist_AI_Phase2_Review_Response_Analysis.md) in the repo root;
> [CHECKPOINT-02](./CHECKPOINT-02-roadmap.md) the Phase 1 recap + Phase 2/3 build order;
> [CHECKPOINT-01](./CHECKPOINT-01-cbc-expert.md) the anemia classifier.
