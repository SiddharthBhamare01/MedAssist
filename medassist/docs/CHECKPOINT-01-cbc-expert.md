# Checkpoint 01 — CBC Expert Module (Deterministic Anemia Engine)

**Stage:** v3 Month 1 ("Detect"). **Status:** backend + validation complete; live integration pending.
**Architecture:** authoritative rule layer — the deterministic engine decides anemia status/type/severity; the LLM only explains it.

---

## Clinical constants (source-cited)

| Concept | Rule | Source |
|---|---|---|
| Anemia cutoff | Men <13.0, non-pregnant women <12.0, pregnant <11.0 g/dL | **WHO 2024** — Guideline on haemoglobin cutoffs to define anaemia |
| Severity (M / non-preg F) | mild 11.0–cutoff · moderate 8.0–10.9 · severe <8.0 | **WHO 2011 VMNIS** (WHO/NMH/NHD/MNM/11.1) |
| Severity (pregnant) | mild 10.0–10.9 · moderate 7.0–9.9 · severe <7.0 | **WHO 2011 VMNIS** |
| Morphology (MCV) | <80 microcytic · 80–100 normocytic · >100 macrocytic | Standard red-cell indices |
| Iron-deficiency confirm | ferritin <45 ng/mL (or TSAT <20%) | **AGA 2020** IDA Clinical Practice Guideline |
| Pregnancy unknown | default to non-pregnant cutoff/scale (more sensitive = conservative) | design decision, recorded in `applied_cutoff_basis` |

## `analysis.anemia` contract
Persisted in `blood_reports.analysis` (JSONB — no schema change). Key fields:
`anemia_present`, `status` (CONFIRMED|SUSPECTED|INCONCLUSIVE|NOT_ANEMIC), `type`, `type_label`,
`severity`, `morphology`, `hemoglobin{value,unit,cutoff,applied_cutoff_basis}`, `indices{mcv,mch,rdw}`,
`iron_studies_present`, `confidence`, `defer_to_physician`, `deferral_reason`, `recommendation`,
`explanation_seed` (the sentence the LLM must explain, not alter), `sources[]`, `computed_at`.

## Files
- `server/data/referenceRanges.js` — shared range table (+MCH, +RDW), `parseRangeString`, `resolveRange`.
- `server/services/anemiaClassifier.js` — `classifyAnemia`, `recomputeStatuses`, `statusByRule`, `canonicalKey`.
- `server/agents/bloodReportAgent.js` — injects determination into prompts, overrides CBC statuses, persists `analysis.anemia`.
- `server/agents/riskScoringAgent.js` — Hematological dimension anchored to rule-based severity.
- `server/routes/bloodReport.js` — deterministic status recompute at upload; anemia passed to risk scoring.
- `server/db/migrate.js` + `migrations/005_pregnancy_flag.sql` — `patient_profiles.pregnant`.
- `client/src/components/AnemiaCard.jsx` + `pages/Patient/Analysis.jsx` — Anemia Mode UI.

## Validation harness result
`node medassist/server/tests/anemia/runClassifier.js` — 28 labeled synthetic CBC cases (incl. 3 pediatric).

```
Binary confusion matrix (anemia present vs absent):
  TP=22  FP=0  TN=6  FN=0
  Sensitivity (recall) : 100.0%
  Specificity          : 100.0%
  False negatives      : 0
  False positives      : 0

Overall field accuracy: 140/140 (100.0%)
RESULT: PASS  (0 false negatives, field accuracy 100.0%)
```

Age adjustment is covered by pediatric fixtures (child normal / child anemic / toddler anemic),
verifying WHO age-banded cutoffs and the age-adjusted microcytosis threshold.

The harness exits non-zero on **any** false negative (the safety-critical failure) — false negatives, not bare accuracy, are the primary metric, per the professor's feedback.

## Verify
- **Unit:** `node medassist/server/tests/anemia/runClassifier.js`
- **Integration:** upload a moderate microcytic CBC → poll `GET /api/blood-report/:id` → confirm `analysis.anemia` + rule-based statuses + anchored Hematological score.
- **Frontend:** `/patient/analysis/:reportId` shows the Anemia Mode card; a normal CBC shows the "No anemia" card; a non-CBC report shows none.
