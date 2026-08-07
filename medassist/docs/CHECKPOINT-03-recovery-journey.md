# Checkpoint 03 — Recovery Journey (Trajectory + Forecast)

**Stage:** v3 Month 2 ("Confirm & Track"), work-plan **Sprint 4** (Weeks 7–8, Aug 4–15). **Status:** complete, deployed on `main`.
**Architecture:** unchanged from Checkpoint 01 — the deterministic engine decides, the LLM only explains. This adds a *second* rule engine (recovery) alongside the anemia classifier, with the same purity and citation contract.

**Date:** 2026-08-06.

---

## What this delivers

Single-report analysis becomes a longitudinal recovery story: hemoglobin plotted over time against the patient's own WHO cutoff, plus a rule-based judgement of whether they are actually responding — and, when and only when the data supports it, an expected time-to-normal.

---

## Clinical constants (source-cited)

| Concept | Rule | Source |
|---|---|---|
| Expected response to iron | Hb rises **≈1 g/dL per week** | **Am J Medicine** 5-trial analysis; Medscape IDA treatment |
| Responder threshold | **≥1 g/dL by day 14** | same |
| Assessable interval | **14–90 days** only | design decision — see "Bounded window" below |
| Trend dead band | ±0.5 g/dL is "stable" | Hb moves ±0.3 on analytic + biological variability alone |
| Recovery target | the patient's WHO anemia cutoff | **WHO 2024** haemoglobin cutoffs |
| Non-response workup | GI blood loss / malabsorption | **AGA 2020** IDA Clinical Practice Guideline |

## `recovery` contract

Returned by `GET /api/blood-report/trajectory`, built by `forecastRecovery()`. Not persisted — recomputed per request from `analysis.anemia` values that were already validated at analysis time.

```
applicable, responder_status, trend, baseline{ts,hb}, latest{ts,hb},
observed_rise, days_elapsed,
forecast{ weekly_rise, target, weeks_to_target, projected_ts, projection[], basis } | null,
defer_to_physician, deferral_reason, recommendation, explanation_seed,
sources[], computed_at
```

`responder_status` ∈ `RECOVERED` · `RESPONDING` · `NOT_RESPONDING` · `TOO_EARLY` · `INTERVAL_TOO_LONG` · `NOT_APPLICABLE` · `NEW_EPISODE` · `INSUFFICIENT_DATA`

---

## The three decisions that matter

### 1. Episode anchoring
The baseline is the first anemic reading of the **current episode** — the first below-cutoff reading *after* the most recent at-or-above-cutoff one — not the oldest anemic reading on file.

Anchoring to the latter makes a relapse read backwards. On real dev data (Jul 27 Hb **15.0** → Aug 2 Hb **10.2**, cutoff 13) a naive baseline turns a **4.8 g/dL fall in six days** into "+2.0 g/dL, recovering, normal in ~3 weeks." The engine now reports `NEW_EPISODE` with physician review for that patient — verified against the live endpoint.

### 2. The forecast is withheld more than it is offered — 21 of 30 fixtures
Every precondition must hold: iron-deficiency type · hemoglobin **not falling** · cutoff **not moved** (`mixed_basis`) · still below target · status `RESPONDING` or `TOO_EARLY`. The type gate runs **before** the interval gate, so a non-iron patient doesn't appear to change state as days pass.

The dangerous failure here is the mirror of a false negative in the classifier: telling someone whose hemoglobin is falling that they are on track.

### 3. Bounded responder window (14–90 days)
Day 14 is a specific clinical checkpoint. At six months the 1 g/dL bar tests nothing — a true responder would have normalized long ago, and a plateaued partial responder fails it identically. Outside the window the engine reports trend only.

The app also **cannot observe whether iron was ever taken**, so the non-responder flag is worded conditionally ("if you have been taking iron, this rise is smaller than typically expected") rather than asserting a failed treatment response. (`supplement_logs` exists if a real adherence signal is wanted later; using it would break the pure-function contract.)

---

## Files

**New**
- `server/services/recoveryForecast.js` — `forecastRecovery`, `episodeStartIndex`, `trendFromRise` + exported constants. Pure, CommonJS, no DB/network.
- `server/tests/recovery/{fixtures,runForecast}.js` — validation harness.
- `client/src/components/RecoveryJourneyCard.jsx` — self-fetching; the verdict card + chart.
- `client/src/data/anemiaLabels.js` — `STATUS_STYLE` / `SEVERITY_STYLE` / `BASIS_LABEL` / `RECOVERY_STYLE` / dot colors, extracted from `AnemiaCard` so both surfaces style a status identically.
- `client/src/data/recoveryValidation.js` — mirrors the harness output.
- `client/src/pages/Patient/AnemiaJourney.jsx` — thin wrapper at `/patient/journey`.

**Modified**
- `server/routes/bloodReport.js` — `GET /trajectory`. **Must stay above `router.get('/:id')`**, which swallows any literal single-segment path declared after it.
- `client/src/pages/Patient/Analysis.jsx` — section reorder, collapsible `Section`, summary merged into `AnemiaCard`.
- `client/src/components/AnemiaCard.jsx` — accepts an optional pre-resolved `summary`.
- `App.jsx` (route), `Layout/Navbar.jsx` (nav), `locales/en.json` + `es.json` (45 `journey.*` keys each, parity checked).

### Endpoint notes
- Deliberately does **not** filter `session_id IS NULL` (unlike `/history`, `/standalone`, `/latest-score`) — a recovery journey spans every CBC the patient uploaded.
- Falls back to `readNumeric(extracted_values, 'hemoglobin')` when `analysis.anemia` is absent, so reports predating the classifier still plot — **13 of 27 rows** on the test account.
- Uses `created_at`, not `anemia.computed_at`, which is null on the `/risk-scores` fallback path.
- The chart keys the x-axis on **epoch ms**, not a formatted date: repeat CBCs land on the same day and a string key collides.
- Read-only. **No migration.**

---

## Validation harness result

`node medassist/server/tests/recovery/runForecast.js` — 30 labeled synthetic journeys.

```
Safety gates:
  Missed non-responders     : 0
  Unsupportable forecasts   : 0
Forecast discipline:
  Offered                   : 9/30
  Withheld                  : 21/30
Overall field accuracy: 97/97 (100.0%)
RESULT: PASS
```

Reports **refusal discipline**, not sensitivity/specificity — this is not a binary classifier and those figures would be meaningless. It hard-fails and exits non-zero on either unsafe class: a missed non-responder, or a forecast emitted on a disqualifying trajectory.

**Both gates were negative-control tested** — disabling the falling-hemoglobin guard makes the suite report `TE-falling: hemoglobin is falling` and exit 1. A suite that passes on first run proves nothing until you have watched it fail.

Fixtures concentrate on refusal, not arithmetic: whether "2.5 weeks" divides correctly is trivially true; whether the engine declines when it should is the actual claim.

---

## UI pass (same day, post-implementation review)

- **Trajectory renders inline** on the analysis page at full width, not behind a link — a click-through buried the point of the feature. One component, two mounts (`/patient/journey` still works).
- **Sections ordered by clinical importance:** Anemia Assessment → Risk Score → Abnormal Findings → Recovery Assessment + chart → Parameter Progress → Follow-up ‖ Symptom Logger → Diet Plan ▸ ‖ Recovery Ingredients ▸.
- **Diet Plan and Recovery Ingredients collapse** — native `<details>` via a `collapsible` prop on `Section`, closed by default. No JS state; keyboard/screen-reader accessible for free.
- **Overall Summary merged into the Anemia card** — on a CBC the two restated the same conclusion. The standalone summary card **still renders when the anemia card is absent** (non-CBC reports), driven off one `showAnemiaCard` flag so the summary appears exactly once.
- **`NEW_EPISODE` status added** — a relapse previously reported as `INSUFFICIENT_DATA`, which reads as "the app is missing information" when 27 reports are on file.
- **Stale accuracy claim fixed** — `anemiaValidation.js` and the `ValidatedBadge` tooltip said 25 cases; the harness had grown to 28. The tooltip now interpolates the constant so it cannot drift again.
- **"Educational use only" banner removed** from the analysis header, at the user's request. ⚠️ This was the only in-app disclaimer (`appDisclaimer` is referenced by nothing). The exported/printed PDF still carries it (`pdfService.js`). The `analysis.educationalDisclaimer` locale key is retained in en/es, so restoring the banner is a one-line change — relevant to the work plan's FDA Clinical Decision Support posture.

---

## Commits (branch `main`, all pushed)

| | |
|---|---|
| `99292c4` | trajectory endpoint + chart (Pillar 1) |
| `fc980eb` | forecast engine + harness (Pillar 2) |
| `8cafedd` | zero-week forecast fix; de-duplicated non-responder advice |
| `a81d74c` | trajectory inline instead of behind a link |
| `500ee65` | section reorder, collapsible cards, `NEW_EPISODE` |
| `1f80525` | stale 25→28 accuracy claim |
| `91415eb` | summary merged into anemia card; disclaimer removed |
| `b491ff9` | Follow-up + Symptom Logger side by side |

---

## Verify

- **Unit:** `node medassist/server/tests/recovery/runForecast.js` → PASS, 0 missed non-responders, 0 unsupportable forecasts.
- **Regression:** `node medassist/server/tests/anemia/runClassifier.js` → PASS, 0 false negatives (this phase adds no anemia-classification logic; the harness is the proof).
- **Integration:** `GET /api/blood-report/trajectory` with a patient bearer token → `points` ascending, `recovery.responder_status` set, `cutoff` matching what `AnemiaCard` shows for the same report. A 404 means the route landed below `router.get('/:id')`.

### ⚠️ Known gap — visual verification
**None of this UI has been confirmed rendered.** Everything above is verified by harness, build, lint, and live API response. The chart, cutoff line, Recovery Assessment card, collapse behavior, section order, and merged anemia card have **not** been seen in a browser (no browser tooling available in the session that built them).

Specifically uncovered at runtime: the `RESPONDING` and `RECOVERED` card states and the dashed projection line — the dev account only ever produces `NEW_EPISODE`. Exercising them needs a patient with **two iron-deficiency CBCs 2–4 weeks apart**.

---

## Resume point

Sprint 4 is complete. Remaining Phase 2 items (both optional, beyond the work plan's Sprint 4 scope):
- **Pillar 3 — unified journey timeline:** chronological feed merging report uploads, `anemia_symptom_logs`, and supplement adherence (`/patient/supplement-log`).
- **Pillar 4 — reminders/nudges:** extend `reminders` (add `type` + recurrence, make `report_id` nullable) via a `db/migrate.js` migration; `reminderService.js` + `emailService.js` already deliver.

Then **Phase 3 — "Prove & Position"** (work-plan Month 3, Sprints 5–6): safety/critical-value net, in-app validation dashboard, positioning brief, capstone walkthrough. See [CHECKPOINT-02](./CHECKPOINT-02-roadmap.md).
