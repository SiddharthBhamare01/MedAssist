# Checkpoint 07 — Phase 2 review, round 2

**Date:** 2026-08-24
**Trigger:** the nine items left open by [CHECKPOINT-06](./CHECKPOINT-06-phase2-review-quick-fixes.md)
**Analysis:** [`MedAssist_AI_Phase2_Review_Response_Analysis.md`](../../MedAssist_AI_Phase2_Review_Response_Analysis.md)

Six of the nine closed or substantially advanced. Three cannot be closed by
writing code, and this document says which and why rather than reporting them
as done.

**Running total across both checkpoints: 8 of 13 review items closed, 2 partly
closed, 3 open.**

---

## 1. Condition inference reframed — the SaMD item

> "Inferring a condition from blood values without a clinician constitutes
> diagnosis… Reframe the feature as pattern flagging plus questions for the
> clinician: the same interface, the same value, materially different risk."

`POST /api/disease/predict` returned **the top 5 most likely diseases, ranked by
an integer `probability` (0–100), each with an ICD-10 code**. That is a
diagnosis: it names a condition and asserts a likelihood, with no clinician in
the loop. "Type 2 Diabetes — 85%" also stops people looking further.

**Which feature this is.** The review describes a "Condition Intelligence
Engine" inferring conditions from *the pattern of abnormal lab parameters*. No
such module exists. The shipped feature with the same regulatory shape is
*symptom*-driven, and that is the one reframed here. Worth confirming with the
professor that it is what they meant.

**What changed** (`agents/diagnosticAgent.js`):

| Before | After |
| --- | --- |
| "top 5 most likely diseases" | "conditions a clinician would want to rule out" |
| `probability: 85` | field removed |
| Ranked by likelihood | **Ordered alphabetically**, so position cannot be read as rank |
| No questions | `clinician_questions` on every item, defaulted if the model omits them |
| — | `how_it_is_ruled_out` — what a clinician would actually do |
| — | Top-level `disclaimer` on every response |

Enforced deterministically, not by prompt. `stripLikelihood()` deletes
`probability`, `confidence`, `likelihood`, `percent`, `percentage`, `score`,
`rank`, `ranking`, `certainty` and `odds` from every item, and removes
likelihood phrasing from prose **sentence by sentence** — word-substitution
produced broken text ("with an possibly given the symptoms"), so offending
sentences are dropped whole and a safe fallback is used if nothing survives.
The alphabetical sort is applied in code after the model returns.

`icd_code` is retained because `POST /disease/tests` needs it to look up
relevant blood tests. It is labelled an internal reference throughout.

**Consumers updated:** `routes/disease.js` (both endpoints; `diseases` kept as
an alias so nothing breaks), `agents/ensembleRunner.js` (task renamed
`disease_diagnosis` → `symptom_flagging`, judge instructed to drop any
likelihood field), `services/groqService.js`, `tests/integration.js`. **No
frontend consumes this endpoint** — verified before touching it — so there is no
UI to update.

**Validation:** `tests/integration.js` now asserts no banned key appears on any
item, that ordering is alphabetical, that `clinician_questions` is non-empty, and
that the disclaimer is present. (Integration tests need a running server and were
not executed in this session.)

---

## 2. Reference ranges from the patient's own report

> "Do not hard-code 12 to 16 g/dL. Parse the range printed on the patient's own
> report and fall back to a labeled default only when parsing fails, disclosing
> that fallback in the interface."

New `resolveEffectiveRange()` in `services/anemiaClassifier.js`. Resolution order:

1. The range printed on the report (`normal_range`, already captured by OCR).
2. The curated table, tagged `range_source: 'fallback'`.

Every recomputed value now carries `range_source` and `applied_range`, so the
interface can disclose which band was used.

Three deliberate decisions:

- **Critical thresholds stay on the curated table.** They are "call a doctor now"
  safety limits, not assay-specific normal bands, and are not the lab's to relax.
  A hemoglobin of 6.0 is critical even if the report prints a range starting at 6.5.
- **Transposed and unparseable ranges are rejected**, not applied. `17.5–13.5`
  from garbled OCR falls back rather than judging every value against an
  impossible band.
- **WHO cutoffs are untouched.** The anemia determination still uses WHO 2024
  (13.0 / 12.0 / 11.0), which is deliberately *not* assay-specific. The printed
  range governs per-parameter normal/abnormal status for the other eight
  recomputed CBC parameters. Worth confirming this reading with the professor.

**Validation — this needed new fixtures.** All 29 existing fixtures are built by
a helper that omits `normal_range`, so they would have passed without exercising
a line of the new path. Seven `RANGE_FIXTURES` were added covering: printed range
overriding the table, printed range flagging what the table misses, no printed
range, unparseable range, transposed bounds, critical threshold surviving a
permissive printed range, and a one-sided range. **7/7 pass**, and the harness
now fails the build on any of them.

---

## 3. Inter-provider disagreement is now measured

> "Measure and report inter-provider disagreement rate and post-vote accuracy.
> If disagreement is low, the design pays six times the cost and latency for no
> benefit."

New `utils/ensembleMetrics.js`, wired into `ensembleRunner`. Every multi-provider
run now logs a `[ensembleMetrics]` line before the judge merges the outputs away.

Three views, because agent outputs are JSON documents and "did they agree?" has
no single definition:

- **exact** — byte-identical. Near-zero in practice; proof that voting cannot
  produce determinism, which is the review's other point.
- **structural** — same set of populated fields.
- **value** — per-field agreement, with 2% numeric tolerance so 9.1 and 9.10
  agree. This is the headline `disagreement_rate`.

Two honesty properties built in: fewer than two providers returns `null`, never
0% — one provider means nothing was cross-checked, and a missing figure must not
read as agreement. Providers returning unparseable output are named rather than
silently dropped.

Stated limit: prose differing in wording but not meaning counts as disagreement,
so the value-level figure is an **upper bound**.

**Validation:** `tests/ensemble/runDisagreement.js`, 16/16.

**Still unmeasured: the production figure.** The instrument exists; the number
comes from real runs and nobody has collected a sample yet. This is the cheapest
remaining item and it feeds the compliance argument directly — if the providers
agree, cutting the fan-out fixes cost, latency and PHI exposure at once.

---

## 4. Interaction alerts scoped and disclosed

> "State that limitation in the interface and scope alerts to a small, curated,
> high-severity set… Add a pharmacist-reviewed suppression layer so that a
> label-derived warning does not prompt a patient to stop a needed drug."

New `data/curatedInteractions.js`: **8 entries**, class-level mechanisms from
standard references, covering iron absorption (relevant to our anemia focus),
bleeding risk, renal/electrolyte and hepatic.

`check_drug_interactions` now returns RxNorm results with severity forced to
`not_graded` and an explicit note that RxNorm supplies normalization, not
severity. Curated matches are the only thing permitted to carry a severity. Both
the disclosure and the never-stop notice are returned even when the network call
fails.

**Two rules enforced by test, not convention** (`tests/interactions/runCurated.js`,
16/16):

1. **No entry may advise stopping a medicine.** Every `patient_action` routes to
   a doctor or pharmacist; several say "do not stop" explicitly. The failure the
   review names is worse than the interaction it warns about.
2. **Curated alerting is disabled** — `isCuratedAlertingEnabled()` returns false
   while `PHARMACIST_REVIEWED` is false and entries are marked `reviewed: false`.
   The set informs the disclosure; it must not drive a patient-facing alert until
   a licensed pharmacist signs off. **We have not obtained that review.**

---

## 5. Association, not causation

> "Showing a patient that 86% adherence produced a 24% hemoglobin rise is an
> n-of-1 causal claim… Present it as a co-occurring trend rather than proof of
> effect."

Adherence tracking does not exist, so there was no adherence-outcome correlation
to soften. Auditing `services/recoveryForecast.js` found it already careful — it
explicitly notes the app cannot observe whether iron was ever taken, and words
non-response conditionally.

Two gaps closed anyway: every result now carries `association_disclaimer`, so no
consumer can render a trajectory without the limit attached; and one
recommendation that presumed treatment ("judge how treatment is working") was
reworded to describe the reading interval instead. The constraint is recorded in
the file header so adherence tracking inherits it when built.

Recovery harness still 97/97.

---

## 6. Week 7 documents

- **`SAMD-POSTURE-MEMO.md`** — one page, as the milestone plan asks. States the
  claim, the boundaries enforced in code with file references, and six places we
  are still exposed. Explicitly not a regulatory determination; no counsel has
  reviewed it.
- **`PHI-DATA-FLOW.md`** — what leaves the system per upload and to whom. Names
  the two under-discussed flows: **the whole report image goes to OCR**, carrying
  any identifiers printed on it, and **Helicone proxies every model call** when
  its key is set. Current posture: no BAAs, no de-identification, residency and
  retention undocumented.

---

## What was NOT done, and why

Stated plainly. These are not oversights.

**LOINC / UCUM and deterministic parsing** — the review asks for regex plus
layout heuristics over OCR output with the model reserved for ambiguous fields.
That is a one-to-two week rewrite of the extraction path and was not attempted.
Extraction remains fully generative.

**The 100-photograph OCR set** — the harness is built
(`tests/ocr/runExtractionAccuracy.js`), the labelling format is defined, the
condition vocabulary covers the review's glare/skew/curl/multi-column plus
`screen_photo` and `non_english_header`, and it reports per-parameter accuracy,
per-condition accuracy, and a **fabrication count** aimed at the known
invented-values failure. **The photographs themselves must be produced by hand
and cannot be generated.** With no `labels.json` the harness exits 2 and says
what is missing rather than reporting a pass. Images and labels are gitignored.

**Pre-visit report as a FHIR Bundle** — does not exist in any form, and depends
on adherence tracking and prescription capture which also do not exist. Three
weeks-plus of product work. **This is the Gate 3 dependency and the schedule
risk.**

**BAAs** — a legal instrument, not a code change. The gap is now documented with
a dependency-ordered plan; signing is not something we can do here.

**Pharmacist review of the curated set** — requires a licensed pharmacist.

---

## Not verified

- **No live end-to-end run.** All five offline harnesses pass and all 13 touched
  modules load, but nothing here was exercised against a live provider or a
  running server. The integration test was updated, not executed.
- **The reframed symptom endpoint has never returned a real response.** The
  deterministic stripping is unit-tested; how well models follow the new prompt
  is unmeasured.
- **The dietary gate is still invisible to patients** (from CHECKPOINT-06) — and
  so are `range_source`, `clinician_questions`, `association_disclaimer` and the
  interaction disclosure. **Every safeguard added across both checkpoints is
  backend-only.** The interface work is now the single largest gap between what
  the system enforces and what a patient actually sees.
- Curated interaction severities are class-level mechanisms from standard
  references, not a pharmacist's judgement.

## Test suites

`npm run test:offline` runs all five. `npm run test:ocr` needs the photographs.

| Suite | Result |
| --- | --- |
| Anemia classifier (29 cases) | PASS — 100% sensitivity/specificity, 151/151 fields |
| Reference-range resolution (7) | PASS — 7/7 |
| Treatment guardrail (29) | PASS |
| Recovery forecast (30) | PASS — 97/97 |
| Ensemble disagreement (16) | PASS |
| Curated interactions (16) | PASS |
