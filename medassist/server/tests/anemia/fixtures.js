/**
 * fixtures.js — labeled synthetic CBC cases for validating the anemia classifier.
 *
 * Each case: { id, description, values[], profile, expected }
 * expected fields are the ground-truth labels the classifier must reproduce.
 * Coverage: normal (M/F/preg), severity × sex, pregnancy-shifted bands,
 * morphology, iron-studies CONFIRMED/SUSPECTED/INCONCLUSIVE, B12/folate,
 * chronic-disease, garbage-Hb, out-of-pattern deferral, pediatric
 * (age-adjusted), and the dietary-guidance gate. (29 cases.)
 */

// helper: build an extracted-value object
const v = (parameter, value, unit = '', abbreviation = '') => ({ parameter, abbreviation, value: String(value), unit });

// helper: an extracted value that also carries the range printed on the report.
// The plain `v()` helper deliberately omits normal_range, so classifier fixtures
// exercise the curated-table path; these exercise the printed-range path.
const vr = (parameter, value, unit, normal_range, abbreviation = '') =>
  ({ parameter, abbreviation, value: String(value), unit, normal_range });

const FIXTURES = [
  // ── Normal ──────────────────────────────────────────────────────────────
  { id: 'N1', description: 'Normal male',
    values: [v('Hemoglobin', 15.0, 'g/dL'), v('MCV', 90, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: false, status: 'NOT_ANEMIC', severity: null, morphology: null, type: null } },
  { id: 'N2', description: 'Normal non-pregnant female',
    values: [v('Hemoglobin', 13.0, 'g/dL'), v('MCV', 88, 'fL')],
    profile: { gender: 'female', pregnant: false },
    expected: { anemia_present: false, status: 'NOT_ANEMIC', severity: null, morphology: null, type: null } },
  { id: 'N3', description: 'Normal pregnant female (Hb 11.5, above 11.0 cutoff)',
    values: [v('Hemoglobin', 11.5, 'g/dL'), v('MCV', 89, 'fL')],
    profile: { gender: 'female', pregnant: true },
    expected: { anemia_present: false, status: 'NOT_ANEMIC', severity: null, morphology: null, type: null } },
  { id: 'N4', description: 'Non-pregnant female exactly at cutoff 12.0 → not anemic',
    values: [v('Hemoglobin', 12.0, 'g/dL'), v('MCV', 86, 'fL')],
    profile: { gender: 'female', pregnant: false },
    expected: { anemia_present: false, status: 'NOT_ANEMIC', severity: null, morphology: null, type: null } },

  // ── Severity × sex (non-pregnant) ─────────────────────────────────────────
  { id: 'M-mild', description: 'Male mild microcytic (Hb 12.0)',
    values: [v('Hemoglobin', 12.0, 'g/dL'), v('MCV', 78, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'mild', morphology: 'microcytic', type: 'iron_deficiency' } },
  { id: 'M-mod', description: 'Male moderate microcytic (Hb 9.0)',
    values: [v('Hemoglobin', 9.0, 'g/dL'), v('MCV', 75, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency' } },
  { id: 'M-sev', description: 'Male severe microcytic (Hb 7.0) → defer',
    values: [v('Hemoglobin', 7.0, 'g/dL'), v('MCV', 70, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'severe', morphology: 'microcytic', type: 'iron_deficiency', defer_to_physician: true } },
  { id: 'F-mild', description: 'Female mild microcytic (Hb 11.5)',
    values: [v('Hemoglobin', 11.5, 'g/dL'), v('MCV', 78, 'fL')],
    profile: { gender: 'female', pregnant: false },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'mild', morphology: 'microcytic', type: 'iron_deficiency' } },
  { id: 'F-mod', description: 'Female moderate microcytic (Hb 9.5)',
    values: [v('Hemoglobin', 9.5, 'g/dL'), v('MCV', 76, 'fL')],
    profile: { gender: 'female', pregnant: false },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency' } },
  { id: 'F-sev', description: 'Female severe microcytic (Hb 6.5) → defer',
    values: [v('Hemoglobin', 6.5, 'g/dL'), v('MCV', 68, 'fL')],
    profile: { gender: 'female', pregnant: false },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'severe', morphology: 'microcytic', type: 'iron_deficiency', defer_to_physician: true } },

  // ── Pregnancy-shifted severity scale ──────────────────────────────────────
  { id: 'P-mild', description: 'Pregnant mild (Hb 10.5 → mild on shifted scale)',
    values: [v('Hemoglobin', 10.5, 'g/dL'), v('MCV', 85, 'fL')],
    profile: { gender: 'female', pregnant: true },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'mild', morphology: 'normocytic', type: 'anemia_of_chronic_disease' } },
  { id: 'P-mod', description: 'Pregnant moderate (Hb 8.5 → moderate on shifted scale)',
    values: [v('Hemoglobin', 8.5, 'g/dL'), v('MCV', 78, 'fL')],
    profile: { gender: 'female', pregnant: true },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency' } },
  { id: 'P-sev', description: 'Pregnant severe (Hb 6.5 → severe on shifted scale) → defer',
    values: [v('Hemoglobin', 6.5, 'g/dL'), v('MCV', 70, 'fL')],
    profile: { gender: 'female', pregnant: true },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'severe', morphology: 'microcytic', type: 'iron_deficiency', defer_to_physician: true } },

  // ── Morphology (explicit) ────────────────────────────────────────────────
  { id: 'MORPH-micro', description: 'Microcytic w/ low MCH + high RDW (Hb 10, MCV 72)',
    values: [v('Hemoglobin', 10.0, 'g/dL'), v('MCV', 72, 'fL'), v('MCH', 22, 'pg'), v('RDW', 16.5, '%')],
    profile: { gender: 'female', pregnant: false },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency' } },
  { id: 'MORPH-normo', description: 'Normocytic (Hb 10, MCV 88)',
    values: [v('Hemoglobin', 10.0, 'g/dL'), v('MCV', 88, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'normocytic', type: 'anemia_of_chronic_disease' } },
  { id: 'MORPH-macro', description: 'Macrocytic (Hb 10, MCV 110)',
    values: [v('Hemoglobin', 10.0, 'g/dL'), v('MCV', 110, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'macrocytic', type: 'b12_folate_deficiency' } },

  // ── Iron studies ──────────────────────────────────────────────────────────
  // `dietary_guidance` is the Phase 2 review gate: only a CONFIRMED determination
  // may drive condition-targeted nutrition. See the anemiaClassifier file header.
  { id: 'IRON-confirm-ferritin', description: 'CONFIRMED iron-deficiency (ferritin 10 <45)',
    values: [v('Hemoglobin', 9.0, 'g/dL'), v('MCV', 74, 'fL'), v('Ferritin', 10, 'ng/mL')],
    profile: { gender: 'female', pregnant: false },
    expected: { anemia_present: true, status: 'CONFIRMED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency', dietary_guidance: 'condition_specific' } },
  { id: 'IRON-confirm-tsat', description: 'CONFIRMED iron-deficiency via TSAT 12% (<20)',
    values: [v('Hemoglobin', 9.0, 'g/dL'), v('MCV', 75, 'fL'), v('Transferrin Saturation', 12, '%')],
    profile: { gender: 'female', pregnant: false },
    expected: { anemia_present: true, status: 'CONFIRMED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency', dietary_guidance: 'condition_specific' } },
  { id: 'IRON-suspect', description: 'SUSPECTED iron-deficiency, no iron panel',
    values: [v('Hemoglobin', 9.0, 'g/dL'), v('MCV', 74, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency', dietary_guidance: 'general_only' } },
  { id: 'IRON-indeterminate', description: 'Microcytic w/ ferritin 60 (45–100 indeterminate)',
    values: [v('Hemoglobin', 10.0, 'g/dL'), v('MCV', 78, 'fL'), v('Ferritin', 60, 'ng/mL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency', dietary_guidance: 'general_only' } },
  { id: 'INCONCLUSIVE-disagree', description: 'Microcytic but ferritin 200 (high) → CBC/iron disagree → defer',
    values: [v('Hemoglobin', 9.0, 'g/dL'), v('MCV', 76, 'fL'), v('Ferritin', 200, 'ng/mL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'INCONCLUSIVE', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency', defer_to_physician: true, dietary_guidance: 'general_only' } },

  // ── Dietary-guidance gate (Phase 2 faculty review) ────────────────────────
  // The case named in the review: "A hemoglobin of 9.1 g/dL is anemia of
  // undetermined cause... Activating a dietary iron module on that value can
  // delay colonoscopy." Must NOT unlock condition-targeted nutrition.
  { id: 'GATE-hb91-no-iron-panel', description: 'Review case — Hb 9.1, MCV 76, no iron studies → general_only + clinician questions',
    values: [v('Hemoglobin', 9.1, 'g/dL'), v('MCV', 76, 'fL'), v('RDW', 16.0, '%')],
    profile: { gender: 'male', age: 58 },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency', dietary_guidance: 'general_only' } },

  // ── B12 / folate + chronic disease ────────────────────────────────────────
  { id: 'B12-macro', description: 'Macrocytic B12/folate pattern (Hb 9.5, MCV 115)',
    values: [v('Hemoglobin', 9.5, 'g/dL'), v('MCV', 115, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'macrocytic', type: 'b12_folate_deficiency' } },
  { id: 'ACD-normo', description: 'Normocytic anemia of chronic disease (Hb 10.5, MCV 88)',
    values: [v('Hemoglobin', 10.5, 'g/dL'), v('MCV', 88, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'normocytic', type: 'anemia_of_chronic_disease' } },

  // ── Deferral / edge cases ─────────────────────────────────────────────────
  { id: 'GARBAGE-hb', description: 'Unparseable hemoglobin → INCONCLUSIVE + defer',
    values: [v('Hemoglobin', 'N/A', 'g/dL'), v('MCV', 85, 'fL')],
    profile: { gender: 'male' },
    expected: { anemia_present: false, status: 'INCONCLUSIVE', severity: null, morphology: null, type: null, defer_to_physician: true } },
  { id: 'NO-MCV', description: 'Anemia present but no MCV → unclassifiable → defer',
    values: [v('Hemoglobin', 9.0, 'g/dL')],
    profile: { gender: 'male' },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: null, type: 'unspecified', defer_to_physician: true } },

  // ── Age-adjusted (pediatric) ──────────────────────────────────────────────
  { id: 'CHILD-normal', description: 'Child 8y, Hb 13.0 ≥ 11.5 pediatric cutoff → not anemic',
    values: [v('Hemoglobin', 13.0, 'g/dL'), v('MCV', 82, 'fL')],
    profile: { gender: 'male', age: 8 },
    expected: { anemia_present: false, status: 'NOT_ANEMIC', severity: null, morphology: null, type: null } },
  { id: 'CHILD-anemic', description: 'Child 8y, Hb 10.5 < 11.5 cutoff, MCV 74 (<77 pediatric micro) → mild microcytic',
    values: [v('Hemoglobin', 10.5, 'g/dL'), v('MCV', 74, 'fL')],
    profile: { gender: 'male', age: 8 },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'mild', morphology: 'microcytic', type: 'iron_deficiency' } },
  { id: 'TODDLER-anemic', description: 'Toddler 3y, Hb 9.5 < 11.0 cutoff, MCV 73 (<75 micro) → moderate microcytic',
    values: [v('Hemoglobin', 9.5, 'g/dL'), v('MCV', 73, 'fL')],
    profile: { gender: 'female', age: 3 },
    expected: { anemia_present: true, status: 'SUSPECTED', severity: 'moderate', morphology: 'microcytic', type: 'iron_deficiency' } },
];

/**
 * Reference-range fixtures — exercise recomputeStatuses / resolveEffectiveRange
 * rather than classifyAnemia. Each case states the range printed on the report
 * and the status + source we expect.
 *
 * Phase 2 review: "Parse the range printed on the patient's own report and fall
 * back to a labeled default only when parsing fails, disclosing that fallback."
 */
const RANGE_FIXTURES = [
  {
    id: 'RR-report-wins',
    description: "Printed range disagrees with our table — the report's range decides",
    // Our table calls 13.0 low for a male (13.5–17.5). This lab prints 12.5–16.5,
    // so the same value is normal on the patient's own report.
    values: [vr('Hemoglobin', 13.0, 'g/dL', '12.5–16.5')],
    profile: { gender: 'male' },
    expected: { parameter: 'Hemoglobin', status: 'normal', range_source: 'report' },
  },
  {
    id: 'RR-report-flags-what-table-misses',
    description: 'Printed range is narrower — flags a value our table would pass',
    values: [vr('MCV', 82, 'fL', '83–101')],
    profile: { gender: 'female' },
    expected: { parameter: 'MCV', status: 'low', range_source: 'report' },
  },
  {
    id: 'RR-no-printed-range',
    description: 'No range on the report → curated table, disclosed as a fallback',
    values: [v('Hemoglobin', 13.0, 'g/dL')],
    profile: { gender: 'male' },
    expected: { parameter: 'Hemoglobin', status: 'low', range_source: 'fallback' },
  },
  {
    id: 'RR-unparseable-range',
    description: 'Garbled OCR range → fallback rather than a nonsense band',
    values: [vr('Hemoglobin', 13.0, 'g/dL', 'see report')],
    profile: { gender: 'male' },
    expected: { parameter: 'Hemoglobin', status: 'low', range_source: 'fallback' },
  },
  {
    id: 'RR-transposed-range',
    description: 'Transposed bounds (17.5–13.5) are rejected, not applied',
    values: [vr('Hemoglobin', 13.0, 'g/dL', '17.5–13.5')],
    profile: { gender: 'male' },
    expected: { parameter: 'Hemoglobin', status: 'low', range_source: 'fallback' },
  },
  {
    id: 'RR-critical-still-table',
    description: 'Critical thresholds stay on our table even when the report supplies a range',
    // Printed range would call 6.0 merely "low"; 6.0 is below the critical_low of
    // 7, and that safety threshold is not the lab's to relax.
    values: [vr('Hemoglobin', 6.0, 'g/dL', '6.5–16.5')],
    profile: { gender: 'male' },
    expected: { parameter: 'Hemoglobin', status: 'critical_low', range_source: 'report' },
  },
  {
    id: 'RR-open-upper-bound',
    description: 'One-sided printed range (>13.0) is usable',
    values: [vr('Hemoglobin', 12.0, 'g/dL', '>13.0')],
    profile: { gender: 'male' },
    expected: { parameter: 'Hemoglobin', status: 'low', range_source: 'report' },
  },
];

module.exports = { FIXTURES, RANGE_FIXTURES };
