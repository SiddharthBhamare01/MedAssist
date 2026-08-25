# Checkpoint 06 — Phase 2 faculty review: first four fixes

**Date:** 2026-08-24
**Trigger:** `MedAssist_AI_Phase2_Review_Dr. Leibovitz's.docx` (Phase 2 faculty review)
**Full analysis:** [`MedAssist_AI_Phase2_Review_Response_Analysis.md`](../../MedAssist_AI_Phase2_Review_Response_Analysis.md) (repo root)

Four items from the review, chosen because they are cheap and one of them is a live
patient-safety defect. The remaining nine items are scoped in the analysis document.

---

## 1. Dietary-guidance gate — the reviewed safety defect

### What the review said

> A hemoglobin of 9.1 g/dL is anemia of undetermined cause: iron deficiency, B12 or
> folate deficiency, thalassemia trait, anemia of chronic disease, hemolysis, or
> occult gastrointestinal malignancy. **Activating a dietary iron module on that
> value can delay colonoscopy.** Gate anemia and thyroid pathways behind explicit
> clinician referral.

### That it reproduced in our code

Traced end to end before changing anything:

1. `services/anemiaClassifier.js` — a microcytic anemia with **no iron studies on the
   report** was still typed `iron_deficiency`, labelled *"Iron-deficiency pattern
   (unconfirmed)"*.
2. That determination was injected into the Phase 2b prompt as the AUTHORITATIVE
   ANEMIA DETERMINATION.
3. `agents/bloodReportAgent.js` instructed the model: *"build the diet/recovery
   around it (**e.g. iron-rich foods for an iron-deficiency pattern**)."*

So low Hb + low MCV + no ferritin produced an iron-themed diet plan and a set of
`recovery_ingredients` targeting iron. Exactly the path the review describes.

### What changed

**`services/anemiaClassifier.js`** — three new rule-engine fields on the anemia
object, set on every branch:

| Field | Meaning |
| --- | --- |
| `dietary_guidance` | `'condition_specific'` \| `'general_only'` |
| `dietary_guidance_reason` | plain-language why, shown to the patient |
| `clinician_questions` | questions to take to a doctor instead |

The rule: **only a `CONFIRMED` determination unlocks condition-targeted nutrition.**
Confirmation requires iron studies (ferritin <45 ng/mL or TSAT <20%, AGA 2020). Every
other path — microcytic-unconfirmed, indeterminate iron studies, CBC/iron
disagreement, macrocytic, normocytic, no-MCV, unreadable Hb — returns `general_only`
with a reason and 2–3 clinician questions. A new `SOURCES.gate` citation (AGA 2020 —
confirm before treating) is pushed onto `sources` whenever the gate denies.

This deliberately extends past the review's ask. The same argument applies to
macrocytic anemia (B12/folate *or* thyroid, alcohol, medication, marrow disease) and
normocytic anemia (chronic disease, kidney, occult blood loss), so all of them are
gated rather than iron alone.

**`agents/bloodReportAgent.js`** — three changes:

- `PHASE2B_SYSTEM` no longer says "iron-rich foods for an iron-deficiency pattern".
  It now reads a `DIETARY GUIDANCE SCOPE` line and, under `general_only`, is
  forbidden from theming the plan around iron/B12/folate, naming supplements, or
  implying the diet treats the anemia.
- **Deterministic backstop.** The gate cannot depend on the model obeying a prompt —
  the file's own principle is "the AI only explains, the rule engine decides". When
  the determination is unconfirmed, `recovery_ingredients` is emptied in code before
  persistence. That field carries an explicit `targets` array, so it is the
  condition-targeting surface and the one most likely to name supplements.
- **Explicit referral.** An unconfirmed anemia now forces `doctor_referral_needed`
  and writes a referral reason, so the flag stored on the report and the summary the
  patient reads agree. The clinical reason leads — on the Phase-2a fallback path the
  pre-existing reason is about provider overload, which is true but is not why the
  report needs a clinician. Verified this is display-only first: `complexity_flag` is
  read by `routes/bloodReport.js:98` and `client/src/pages/Patient/Analysis.jsx` and
  triggers no email or notification.
- **`diet_plan` is stamped, not trusted.** The plan prose is still model-written, so
  when the gate is active `diet_plan.scope = 'general_only'` and `diet_plan.overview`
  is overwritten with the rule engine's reason. A model that ignores the scope
  instruction is still labelled correctly in the persisted object, and the frontend
  gets one field to key on.

**Product-behavior change worth flagging:** because the gate covers macrocytic and
normocytic anemia too, a doctor referral is now forced for **21 of the 23 anemic
fixtures** — every anemia except confirmed iron deficiency. That is clinically
defensible (an unconfirmed cause is exactly when a clinician is needed) but it is a
large change to what most patients see, and it rode along with a small fix. Narrow it
to the microcytic path if that is too broad.

`dietary_guidance`, `dietary_guidance_reason` and `clinician_questions` are persisted
onto `analysis` from the rule engine, not the LLM, so the gate is auditable.

### Validation

`tests/anemia/fixtures.js` — `dietary_guidance` added to the expected labels on the
five iron-studies fixtures, plus one new case reproducing the review's scenario
verbatim:

```
GATE-hb91-no-iron-panel — Hb 9.1, MCV 76, RDW 16.0, male 58, no iron studies
  → status SUSPECTED, dietary_guidance 'general_only'
```

`tests/anemia/runClassifier.js` — `dietary_guidance` added to `CHECK_FIELDS`, so the
gate is now covered by the same harness as the classification itself.

```
ANEMIA CLASSIFIER VALIDATION — 29 synthetic CBC cases
  TP=23  FP=0  TN=6  FN=0
  Sensitivity 100.0%   Specificity 100.0%
  Overall field accuracy: 151/151 (100.0%)
  RESULT: PASS
```

Sensitivity and specificity are unchanged from the 28-case baseline; field checks
rose 145 → 151 because the gate is now asserted. Guardrail (29/29) and recovery
(97/97) harnesses re-run and still pass.

---

## 2. Four named clinical instruments removed from the risk prompt

The review flagged Framingham. Reading the prompt, we were doing the same thing with
three more: `agents/riskScoringAgent.js` told the model to evaluate
`Framingham-based`, `FINDRISC-based`, `CKD-EPI-based` and `Child-Pugh-based` risk.

None was implemented. The model was asked to produce numbers *labelled* with
validated instruments whose required inputs we never collect — blood pressure,
smoking status, treatment status for Framingham; ascites and encephalopathy grading
for Child-Pugh.

Changed the four parenthetical labels to plain descriptions of the inputs actually
present on a lab panel, and added an explicit prohibition:

> This is a heuristic triage signal computed from the values on this report. It is
> NOT a validated clinical risk score. Never name, cite, or claim to compute a
> published instrument (Framingham, PREVENT, ASCVD, FINDRISC, CKD-EPI, MDRD,
> Child-Pugh, MELD or any other) …

The dimension names (`Cardiovascular risk`, `Diabetes risk`, …) are byte-identical —
`applyDeterministicRisk` matches the hematological tile with `/hematolog/i` against
`b.area`, so renaming would have risked the rule-based override.

The composite score itself is unchanged and still rule-derived from anemia severity.
We did not adopt PREVENT: it needs the same inputs Framingham does. The review's
"either collect the full input set … or remove the score" is answered by removing the
claim rather than the feature.

---

## 3. Repository hygiene

`sample-cbc-reports/` (3 lab report PDFs) was untracked **and not ignored** — one
`git add .` would have committed it. Added it and related patterns to `.gitignore`
under the existing user-data block.

Not done: **33 image files are currently tracked**, 16 in
`medassist/docs/unpacked_report/word/media/` and 15 in `medassist/img/`. Nobody has
confirmed none of them is a photographed patient report. That check is outstanding.

---

## 4. Vendor terms manifest

`THIRD-PARTY-LICENSES.md` listed hosted services as a single sentence naming ten
vendors, with no terms, data flows, or restrictions.

Two accuracy problems found: it still named **GitHub Models** (retired, HTTP 410 since
13 Aug 2026), and it omitted **Groq** — the lead AI provider since commit `239cd32`.
A vendor we actively transmit to was undocumented.

Rewrote the section as a table: service, use, report data sent, terms to confirm.
Eleven rows — ten live plus GitHub Models marked retired-but-defined. Added an
explicit *not yet addressed* paragraph on BAAs and de-identification, and a separate
subsection for infrastructure subprocessors (Render, Vercel, SMTP, OpenStreetMap).

**Edited the generator, not the output.** `scripts/license-manifest.js:126+` produces
that section; editing `THIRD-PARTY-LICENSES.md` by hand would be wiped on the next
regeneration. Regenerated and diffed: only the date and the intended section changed,
no churn in the 37-package dependency table.

Two rows verified rather than assumed:

- **Helicone** proxies *every* provider call when `HELICONE_API_KEY` is set
  (`utils/aiClients.js:44-48`) — it sees all prompts, which carry lab values.
- **OpenRouter** is an aggregator, so the downstream model host is not fixed by us.

---

## Not verified / outstanding

- **The gate's patient-visible effect depends on frontend work that was not done.**
  The backend now withholds targeted guidance, empties `recovery_ingredients`, forces
  the referral flag and persists `clinician_questions` — but no UI renders
  `dietary_guidance_reason` or the questions yet. Half the safety fix has landed.
  `client/src/pages/Patient/Analysis.jsx` and `AnemiaCard.jsx` are the surfaces.
- **No live end-to-end run.** All four changes are verified by the offline harnesses
  and module load only. The `general_only` prompt path has not been exercised against
  a real provider, so how well models obey the scope instruction is unmeasured. The
  deterministic backstop covers `recovery_ingredients` (dropped) and `diet_plan`'s
  `scope`/`overview` (stamped), but the **food lists themselves remain model-written**
  — nothing in code prevents a disobedient model from listing iron-rich foods under a
  correctly-labelled general plan.
- **Thyroid and renal referral gates are not built.** The review asks for anemia,
  thyroid and renal. Only anemia is gated.
- **Tracked-image audit** (§3) outstanding.
- Effort estimates in the analysis document are unscoped.

## Still open from the review

Nine of thirteen items remain — reference ranges parsed from the patient's own report,
LOINC/UCUM, the `/api/disease/predict` SaMD reframe, inter-provider disagreement
measurement, the 100-photograph OCR test set, deterministic extraction, curated
interaction alerts, the SaMD posture memo, and the pre-visit report / FHIR bundle
(**the Gate 3 dependency, and the schedule risk**). See the analysis document.
