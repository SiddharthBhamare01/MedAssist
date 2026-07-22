/**
 * anemiaValidation.js — results of the deterministic classifier's validation
 * harness, surfaced in the UI so users and reviewers can judge reliability.
 *
 * These numbers come from `medassist/server/tests/anemia/runClassifier.js`
 * over 25 labeled synthetic CBC cases. Regenerate after any classifier change:
 *   node medassist/server/tests/anemia/runClassifier.js
 */
export const ANEMIA_VALIDATION = {
  cases: 25,
  sensitivity: 100,      // % of true anemia cases correctly flagged (0 missed)
  specificity: 100,      // % of non-anemic cases correctly cleared
  falseNegatives: 0,     // the safety-critical metric — a missed anemia
  falsePositives: 0,
  fieldAccuracy: 100,    // status/severity/morphology/type exact-match
  sources: [
    'WHO 2024 — haemoglobin cutoffs to define anaemia',
    'WHO 2011 VMNIS — severity bands (WHO/NMH/NHD/MNM/11.1)',
    'AGA 2020 — iron-deficiency (ferritin < 45 ng/mL)',
  ],
};
