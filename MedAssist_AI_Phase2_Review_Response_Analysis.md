# Phase 2 Faculty Review (Dr. Leibovitz) — What We Actually Need to Change

Analysis of `MedAssist_AI_Phase2_Review_Dr. Leibovitz's.docx` against the repository
as of 2026-08-24 (branch `main`, HEAD `9e4b971`). Every claim about the **code** was
checked against the file and line named. The **effort estimates in §2 are unscoped
guesses** for ordering purposes only — nobody has sized this work.

---

## 0. Read this first: the review is grading the proposal, not the repo

Section 1 of the review describes Phase 2 in the present tense as a working system:
a prescription workflow with OCR'd drug/dose/timing, an RxNorm + openFDA interaction
check, mealtime-anchored reminders, a timestamped adherence log, recovery
effectiveness scoring correlating adherence with parameter trajectories, and a
pre-visit PDF with a three-visit delta table.

**Most of that does not exist in the repository yet.**

| Feature the review describes as built | Evidence in repo |
| --- | --- |
| Adherence log / adherence % | `grep -ri adherence server client/src` → **0 hits** |
| Prescription OCR (drug, dose, timing) | none — OCR is lab-report only (`services/geminiService.js`) |
| Pre-visit report / three-visit delta table | none — `services/pdfService.js` exports `generateSessionPDF` and `generateSummaryCardPDF` only |
| Recovery effectiveness scoring | `services/recoveryForecast.js` does Hb trajectory + forecast; no adherence correlation |
| Framingham score | **1 hit**, and it is a line inside an LLM prompt (`agents/riskScoringAgent.js:51`) — not a calculation |
| "Condition Intelligence Engine", nine condition categories | no such module; see §1 item 1 |

So the 13 review items split into two very different kinds of work:

- **Change what ships today** — a handful of real defects and reframes, mostly small.
- **Build to this spec** — constraints on features not yet written.

That distinction matters for how we reply. Answering "we will fix that" to an item
about a feature we never built reads as agreement that it was broken; the honest
answer is "that feature is Phase 2 scope and we will build it to that constraint."

**Decide this before we reply:** does the Phase 2 proposal we submitted describe
these features as already working? If it does, the mismatch is the thing to correct
first — the professor is reviewing against a system they believe exists.

### The schedule risk

Week 10 is **Gate 3**: *"Demonstrate report upload through pre-visit PDF end to end,
including failure paths."* The pre-visit PDF does not exist. That gate is sitting on
top of a multi-week build (prescription capture → adherence log → three-visit delta →
report generation), not a wording change. Everything in weeks 7–9 is comparatively
cheap; **Gate 3 is where the plan is tight.** If anything needs renegotiating with
the professor, it is this, and now rather than in week 10.

---

## 1. Item-by-item, with file locations

### Bucket A — Already partly satisfied (small work, existing hooks)

**1. Reference ranges parsed from the patient's own report** *(Week 8 — real defect, small fix)*

This is the tightest item in the review and it is nearly done already:

- The OCR prompt **already extracts** the printed range: `normal_range` is a required
  field in both `TEXT_PARSE_PROMPT` and `VISION_PARSE_PROMPT`
  (`medassist/server/services/geminiService.js:35`, `:56`).
- The deterministic classifier **ignores it**: `services/anemiaClassifier.js` has
  **0 occurrences of `normal_range`**; it calls `resolveRange()` from the hard-coded
  table (`anemiaClassifier.js:16`).
- The hard-coded table is exactly what the review names — `data/referenceRanges.js:15`
  is `hemoglobin: { male: '13.5–17.5 g/dL', female: '12.0–15.5 g/dL' }`.

Fix: prefer the report-printed range, fall back to the table, and **label the fallback
in the UI**. `parseRangeString()` (`referenceRanges.js:74`) already parses the string
format; the frontend has a mirror parser in `ParameterProgress.jsx`. This is plumbing
plus a disclosure badge, not new extraction.

Scope note — this is bigger than a display change. `resolveRange()` feeds the
deterministic status recompute for the whole `CBC_RECOMPUTE_KEYS` set: hemoglobin,
hematocrit, rbc, mcv, mch, mchc, rdw, wbc, platelets. Those eight non-Hb parameters
are precisely where the assay-specific printed range **should** win, and where our
hard-coded table is most likely to be wrong.

One caveat to raise with the professor: the WHO anemia cutoffs (13.0 / 12.0 / 11.0)
and the WHO 2011 severity bands are *not* assay-specific and are deliberately not
lab-printed ranges. **Hemoglobin's anemia determination should stay on WHO**; every
other recomputed parameter should move to the printed range. Worth stating so the
change does not accidentally undo the WHO 2024 citation work.

**2. Inter-provider disagreement rate** *(Week 9 — instrumentation only)*

`agents/ensembleRunner.js` already returns `agentOutputs` (per-provider raw output,
`ensembleRunner.js:225`, `:232`). Measuring disagreement is a metrics layer over an
existing return value, not an architecture change. Note the review's implied
conclusion is live: PROGRESS.md records that production has often run on **one**
provider (OpenRouter) when free tiers are exhausted, which is itself evidence about
what the other five buy us.

**3. "Flagging, not diagnosis" — we have prior art**

`utils/treatmentGuardrail.js` is exactly the pattern the review asks for, applied to
treatment questions: a deterministic rule that defers to a clinician rather than
trusting the model to decline. The same shape extends to condition inference.

**4. Vendor manifest**

`THIRD-PARTY-LICENSES.md` exists and is generated by
`medassist/scripts/license-manifest.js`. It already has a "Services accessed over the
network" section — but it is **one sentence listing ten vendors**
(`THIRD-PARTY-LICENSES.md:72-75`) with no per-vendor terms, restrictions, data
residency, or retention. The review wants a row per vendor. Extend this file; do not
start a new one.

Two accuracy problems in that sentence, and the second is the serious one:

- It still names **GitHub Models**, which PROGRESS.md records as retired (HTTP 410)
  and removed from every priority order. Remove it.
- **Groq is absent** — despite being the *lead* AI provider as of commit `239cd32`
  (`server/utils/aiClients.js:97`). A vendor we currently transmit to was never added
  to the manifest.

That second point makes the professor's estimate an undercount rather than an
overcount: they said "at least eight sets of terms in the manifest." The regenerated
table now carries **eleven rows — ten live services plus GitHub Models, which is
still defined in code but disabled**. Saying so ourselves reads better than being
corrected on it. (Infrastructure — Render, Vercel, SMTP, OpenStreetMap — is listed
separately: those are subprocessors holding the same data, not API terms, and
folding them into the vendor count would muddle the point.)

---

### Bucket B — Real code work on shipping features

**5. Condition inference → flagging + questions** *(Week 7 — largest item)*

The "Condition Intelligence Engine" as described (infer condition from the *pattern
of abnormal lab parameters*) is not in the repo. But a feature with **the same
regulatory shape ships today**:

`POST /api/disease/predict` (`server/routes/disease.js:18`) → `runDiagnosticAgent`
(`agents/diagnosticAgent.js`) returns **top-5 named diseases with ICD-10 codes and a
0–100 probability** from patient symptoms. The prompt asks for `"probability": 85`
and a real ICD-10 code per disease.

That is the software-as-a-medical-device exposure, and it is live now. It is
*symptom*-driven rather than *lab-pattern*-driven, so we should tell the professor
which feature we are reframing — otherwise we will write a memo about a module that
does not exist while the actual exposure ships unchanged.

Work: change the output contract from ranked named diagnoses with probabilities to
flagged patterns + questions for the clinician; keep the same UI real estate.

**6. Referral gates for anemia / thyroid / renal** *(Week 7 — confirmed live defect)*

**The review's scenario reproduces in our code.** Traced end to end:

1. `services/anemiaClassifier.js:311` — a microcytic anemia with **no iron studies**
   is still typed `iron_deficiency`, labelled *"Iron-deficiency pattern
   (unconfirmed)"*.
2. That determination is injected into the diet prompt as the AUTHORITATIVE ANEMIA
   DETERMINATION.
3. `agents/bloodReportAgent.js:104` instructs: *"build the diet/recovery around it
   (**e.g. iron-rich foods for an iron-deficiency pattern**)."*

So a low hemoglobin with a low MCV and no ferritin produces an iron-rich diet plan —
exactly the path the review says can delay a colonoscopy. This is a patient-safety
item, not a framing item, and it is the strongest argument for doing Week 7 first.

In fairness to what we built, the classifier is more careful than the review assumes
elsewhere: normocytic anemia falls through to `TYPE_LABELS.unspecified`
(`anemiaClassifier.js:334`), indeterminate iron studies produce an explicit
"physician review recommended" (`:306`), and `bloodReportAgent` already emits
`doctor_referral_needed` / `referral_reason` (`:91`). The gap is specifically the
**unconfirmed-microcytic → dietary iron** path.

Fix: gate the dietary-iron branch on `iron_deficiency_confirmed`, and have the
unconfirmed path emit referral + questions instead of food guidance. Then apply the
same gate shape to thyroid and renal patterns.

**7. Framingham — and three more named scores** *(Week 8 — cheap, but bigger than the review knows)*

`agents/riskScoringAgent.js:51` instructs the LLM:

> `- Cardiovascular risk (Framingham-based: total cholesterol, HDL, LDL, BP, smoking, diabetes history)`

There is no Framingham implementation — the model is asked to produce a score
*labelled* Framingham-based without BP, smoking status, or treatment status ever being
collected. The same prompt block does this for **three more** named instruments:
`FINDRISC-based`, `CKD-EPI-based`, and `Child-Pugh-based` (`riskScoringAgent.js:52-54`).
Child-Pugh in particular requires ascites and encephalopathy grading, which no lab
panel contains.

The review says "collect the full input set and use PREVENT, or remove the score."
Recommendation: **drop the instrument names from the prompt** for all four. The
composite score can stay as a heuristic triage signal as long as it does not borrow
the authority of a validated instrument it does not compute. That is a prompt-string
edit — hours, not days — and it closes four exposures instead of one.

**8. Deterministic numeric extraction + LOINC/UCUM** *(Weeks 8–9)*

Today extraction is fully generative — the vision model is asked to return values
*and* to "Determine status by comparing value to normal_range"
(`geminiService.js:41`, `:62`). Post-hoc rule correction exists for CBC only
(`CBC_RECOMPUTE_KEYS`, `anemiaClassifier.js`). The review wants regex + layout
heuristics first, LLM only for ambiguous fields, plus LOINC codes and UCUM units.
The `SYNONYMS` map in `anemiaClassifier.js` is the natural place to hang LOINC codes.

**9. 100-photograph real-world OCR test set** *(Week 9 — new work, do not underestimate)*

We have validation harnesses for classification (28 labelled CBCs, 30 labelled
journeys) but **no extraction-accuracy measurement**, and the sample set is 3 clean
PDFs (`sample-cbc-reports/`). The review specifically wants glare, skew, curl, and
multi-column — i.e. real photographs. Collecting and labelling 100 of those is the
single biggest non-build task in weeks 7–9.

**10. openFDA / RxNorm limitation disclosure + curated alert set** *(Weeks 11–13)*

`agents/tools/medicalTools.js` already calls both: `check_drug_interactions` via
RxNorm (`medicalTools.js:54`, `:144`) and drug label lookup via openFDA
(`medicalTools.js:177`). The review's point stands — RxNorm normalizes, it does not
grade severity, and openFDA returns label prose. Scope alerts to a curated
high-severity list with pharmacist review, and state the limitation in the UI.

---

### Bucket C — Not built yet → treat as design constraints, not fixes

These are specs for work we have not started. Nothing to change; everything to build
correctly the first time.

| Review item | Constraint to build to |
| --- | --- |
| Adherence → outcome causality | Present as **co-occurring trend**, never "86% adherence produced a 24% Hb rise." Language decision made *before* the feature is written. Also audit `services/recoveryForecast.js` now for any existing causal phrasing. |
| Pre-visit report | Emit **FHIR Bundle** (Observation + MedicationStatement in a DiagnosticReport wrapper) alongside the PDF, not PDF-only. Design the data model for this from the start — retrofitting FHIR onto an HTML-to-PDF pipeline is the expensive path. |
| Interaction alerts | Curated high-severity set + pharmacist-reviewed suppression layer, so a label-derived warning never reads as "stop taking this." |
| Prescription OCR | Same disclosed-fallback and deterministic-parsing rules as lab extraction. |

---

### Bucket D — Non-code deliverables

**11. SaMD posture memo** *(Week 7, one page)* — no equivalent exists. PROGRESS.md
lists a "regulatory positioning brief" as Month 3 work; this pulls it into week 7.

**12. Eight-vendor terms manifest** *(Week 7)* — extend `THIRD-PARTY-LICENSES.md` as
described in item 4. Add per-vendor: service terms URL, PHI/BAA status, data
residency, retention. Note the review's UMLS point: some RxNorm source vocabularies
require UMLS credentials, which our current single-sentence entry does not capture.

**13. PHI / BAA position** *(Week 7)* — currently unaddressed anywhere in the repo.
The review's framing is the one to take seriously: *a single non-covered provider in
the fan-out invalidates the compliance story.* This interacts directly with item 2 —
if the disagreement rate shows the six-provider ensemble buys little accuracy, then
**cutting providers is simultaneously the cost fix, the latency fix, and the
compliance fix.** That is the strongest single argument available to us in week 9.

**14. Repository hygiene** — the review says commit no photographed reports or
prescription images. Two things to check now:

- `sample-cbc-reports/` is **untracked but not in `.gitignore`** (that is what `??`
  in `git status` means) — a `git add .` would sweep it in. Add the pattern.
- **33 image files are tracked**, including 16 in
  `medassist/docs/unpacked_report/word/media/` unpacked from the project report and
  15 in `medassist/img/`. Confirm none is a photographed patient report or
  prescription. (No PDFs are tracked.)

---

## 2. Suggested order of work

Ranked by (impact on the review) ÷ (effort), not by week number. **Effort figures are
unscoped estimates.**

| # | Task | Files | Effort | Bucket |
| --- | --- | --- | --- | --- |
| 1 | Gate dietary-iron on `iron_deficiency_confirmed`; unconfirmed → referral + questions | `anemiaClassifier.js:311`, `bloodReportAgent.js:104` | ~1 day | B |
| 2 | Strip Framingham/FINDRISC/CKD-EPI/Child-Pugh labels from the risk prompt | `riskScoringAgent.js:51-54` | hours | B |
| 3 | `.gitignore` for `sample-cbc-reports/`; audit 33 tracked images | `.gitignore` | minutes | D |
| 4 | Add Groq, drop GitHub Models, expand to a per-vendor terms table | `THIRD-PARTY-LICENSES.md:72` | ~1 day | A/D |
| 5 | Prefer report-printed range for the 8 recomputed non-Hb params + fallback badge | `anemiaClassifier.js`, `referenceRanges.js` | ~1–2 days | A |
| 6 | Disagreement-rate instrumentation over `agentOutputs` | `ensembleRunner.js:232` | ~1 day | A |
| 7 | Reframe `/api/disease/predict`: flags + questions, no probabilities/ICD ranking | `diagnosticAgent.js`, `routes/disease.js:18` | 2–3 days | B |
| 8 | Extend referral gates to thyroid and renal patterns | `anemiaClassifier.js` + new | 2–3 days | B |
| 9 | SaMD posture memo | new, 1 page | 1 page | D |
| 10 | 100-photo OCR test set + per-parameter accuracy table | new | 1–2 weeks | B |
| 11 | Deterministic parsing + LOINC/UCUM | `geminiService.js`, `anemiaClassifier.js` | 1–2 weeks | B |
| 12 | Pre-visit report + FHIR → **Gate 3 dependency** | new | 3+ weeks | C |

Items 1–9 answer most of weeks 7–8 and cost roughly one working week between two
people. Items 10–12 are the real Phase 2 build.

---

## 3. What to raise with the professor

1. **The proposal/repo gap** — confirm which Phase 2 features they believe are
   already running, so weeks 7–13 are planned against reality.
2. **Which feature is "condition inference"** — the shipped exposure is the
   symptom-based `/api/disease/predict`, not a lab-pattern engine. We will reframe
   that one; confirm it is what they meant.
3. **Gate 3 feasibility** — end-to-end through a pre-visit PDF in week 10, when the
   pre-visit report is not started.
4. **Four instruments, not one** — we found FINDRISC, CKD-EPI, and Child-Pugh with
   the same defect as Framingham. Worth saying; it shows we read past the specific
   example.
5. **Keep the WHO anemia cutoffs** as cutoffs while switching per-parameter display
   to report-printed ranges — confirm that reading of the reference-range item.
