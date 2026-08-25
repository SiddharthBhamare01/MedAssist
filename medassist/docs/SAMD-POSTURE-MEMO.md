# Software-as-a-Medical-Device posture — MedAssist AI

**One page, as requested in the Phase 2 review milestone plan (Week 7).**
Author: Team Alpha · 24 Aug 2026 · Status: **draft for faculty review, not legal advice**

---

## 1. What we claim to be

MedAssist AI explains a patient's own laboratory results in plain language, tracks
those values over time, and prepares the patient to have a better conversation
with a clinician. **It does not diagnose, does not recommend treatment, and does
not replace a clinical encounter.**

Every clinical determination the product displays is computed by a deterministic
rule engine from published cutoffs (WHO 2024, WHO 2011 VMNIS, AGA 2020), cited
in-product at the point of use. The language model explains a decision the rules
have already made; it never makes one. That separation is the core of our safety
argument and is enforced in code, not by prompt.

## 2. Why this is the boundary that matters

The Phase 2 review put it directly:

> Inferring a condition from blood values without a clinician constitutes
> diagnosis and places the product within software-as-a-medical-device scope.
> Reframe the feature as pattern flagging plus questions for the clinician: the
> same interface, the same value, materially different risk.

We accept this framing. Under the US FDA's Clinical Decision Support guidance,
software is more likely to fall outside device regulation when it (a) displays
medical information the clinician or patient could otherwise obtain, (b) does not
analyse an image or signal directly, (c) supports rather than replaces the
clinician's own judgement, and (d) makes its basis transparent enough for the
recipient to independently review it. Naming a condition and asserting a
likelihood defeats (c) and (d) at once.

**This memo is a positioning statement, not a regulatory determination.** No
regulatory counsel has reviewed the product. A formal classification decision is
required before any deployment outside a classroom.

## 3. Boundaries we enforce in code

| Boundary | How it is enforced | Where |
| --- | --- | --- |
| No treatment or medication advice | Deterministic pattern check on the only free-text surface; defers to a clinician regardless of phrasing, in English and Spanish | `utils/treatmentGuardrail.js` |
| No condition named with a likelihood | `probability`, `confidence`, `likelihood`, `rank` and `score` are stripped from every item; likelihood phrasing removed sentence-by-sentence from prose; output ordered alphabetically so position cannot read as rank | `agents/diagnosticAgent.js` |
| No targeted nutrition on an unconfirmed cause | Only a `CONFIRMED` determination unlocks condition-specific dietary guidance; everything else returns general nutrition plus questions and forces a referral | `services/anemiaClassifier.js`, `agents/bloodReportAgent.js` |
| No unearned clinical instrument | Naming Framingham, PREVENT, ASCVD, FINDRISC, CKD-EPI, MDRD, Child-Pugh or MELD is prohibited; the composite is labelled a heuristic triage signal | `agents/riskScoringAgent.js` |
| No causal claim from a trajectory | Every recovery result carries an association-not-causation disclaimer; wording stays conditional because the app cannot observe whether treatment was taken | `services/recoveryForecast.js` |
| Clinical determination not model-authored | Rule engine computes status, severity, morphology and confirmation; the model receives the determination as fixed and may only explain it | `services/anemiaClassifier.js` |

Each boundary has a validation harness that fails the build rather than warning:
29 classifier cases with zero tolerance for false negatives, 7 reference-range
cases, 29 guardrail cases, 30 recovery journeys, 16 disagreement-metric checks.

## 4. Where we are still exposed

Stated plainly, because a posture memo that lists only strengths is not one.

1. **The gate is invisible.** The rule engine withholds targeted guidance and
   stores the reason and the clinician questions, but no interface renders them.
   A patient today sees a general plan with no explanation of why it is general.
   Backend enforcement without patient-facing disclosure is half a safeguard.
2. **Prose is still model-generated.** Structured fields are dropped
   deterministically; the diet text itself is not. A model that ignores its scope
   instruction can still write iron-themed prose inside a correctly-labelled
   general plan.
3. **Thyroid and renal are ungated.** The review asks for anemia, thyroid and
   renal referral gates. Only anemia is built.
4. **Extraction is generative.** Values are read off the report by a vision
   model, and per-parameter extraction accuracy has never been measured on real
   photographs. An unreadable image has been observed to produce invented values.
   This is the most serious open item on the list: every downstream safeguard
   assumes the numbers are real.
5. **No PHI agreements.** See `PHI-DATA-FLOW.md`.
6. **No regulatory counsel has reviewed any of this.**

## 5. Position

For classroom and demonstration use, with synthetic or consenting-self data, the
current posture is defensible: rules decide, the model explains, and the product
declines rather than guesses.

**For any pilot with real patient data it is not sufficient.** Items 1, 2 and 4
above would each need closing first, and item 5 is a precondition rather than a
task. We would not put this in front of a patient who was not a member of the
team, and we do not intend to until those are addressed.

---

*Companion documents: `PHI-DATA-FLOW.md` (vendor and data-residency posture),
`../../THIRD-PARTY-LICENSES.md` (vendor terms manifest),
`CHECKPOINT-06-phase2-review-quick-fixes.md` and
`CHECKPOINT-07-phase2-review-round-2.md` (what changed and what did not).*
