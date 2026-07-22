/**
 * anemiaClassifier.js — deterministic, source-cited CBC / anemia engine.
 *
 * "The AI only explains the result, never decides it." Every value here is
 * computed by rule from the numbers + authoritative cutoffs — no LLM involved.
 * Pure functions only (no DB, no network) so the validation harness can call
 * them directly.
 *
 * Clinical sources:
 *   - Anemia cutoffs: WHO 2024 (Guideline on haemoglobin cutoffs to define anaemia)
 *     men <13.0, non-pregnant women <12.0, pregnant <11.0 g/dL
 *   - Severity bands: WHO 2011 VMNIS (WHO/NMH/NHD/MNM/11.1) — pregnant scale shifted
 *   - Iron-deficiency confirmation: AGA 2020 IDA guideline (ferritin <45 ng/mL; TSAT <20%)
 */

const { resolveRange } = require('../data/referenceRanges');

const SOURCES = {
  cutoff:  { claim: 'anemia cutoff', source: 'WHO 2024 Guideline on haemoglobin cutoffs to define anaemia' },
  severity:{ claim: 'severity band', source: 'WHO 2011 VMNIS (WHO/NMH/NHD/MNM/11.1)' },
  confirm: { claim: 'iron-deficiency confirmation', source: 'AGA 2020 IDA Clinical Practice Guideline (ferritin <45 ng/mL)' },
};

// Normalized parameter name / abbreviation → canonical key.
const SYNONYMS = {
  hb: 'hemoglobin', hgb: 'hemoglobin', haemoglobin: 'hemoglobin', hemoglobin: 'hemoglobin',
  hct: 'hematocrit', pcv: 'hematocrit', haematocrit: 'hematocrit', hematocrit: 'hematocrit',
  'packed cell volume': 'hematocrit',
  rbc: 'rbc', 'rbc count': 'rbc', 'red blood cell': 'rbc', 'red blood cells': 'rbc',
  'red blood cell count': 'rbc', erythrocyte: 'rbc', erythrocytes: 'rbc', 'erythrocyte count': 'rbc',
  mcv: 'mcv', 'mean corpuscular volume': 'mcv', 'mean cell volume': 'mcv',
  mch: 'mch', 'mean corpuscular hemoglobin': 'mch', 'mean corpuscular haemoglobin': 'mch',
  'mean cell hemoglobin': 'mch',
  mchc: 'mchc', 'mean corpuscular hemoglobin concentration': 'mchc',
  'mean corpuscular haemoglobin concentration': 'mchc',
  rdw: 'rdw', 'rdw cv': 'rdw', 'rdw sd': 'rdw', 'red cell distribution width': 'rdw',
  'red blood cell distribution width': 'rdw',
  wbc: 'wbc', 'wbc count': 'wbc', 'white blood cell': 'wbc', 'white blood cells': 'wbc',
  'white blood cell count': 'wbc', leukocyte: 'wbc', leukocytes: 'wbc', tlc: 'wbc',
  'total leukocyte count': 'wbc',
  platelet: 'platelets', platelets: 'platelets', 'platelet count': 'platelets',
  plt: 'platelets', 'plt count': 'platelets', thrombocyte: 'platelets', thrombocytes: 'platelets',
  ferritin: 'ferritin', 'serum ferritin': 'ferritin',
  iron: 'iron', 'serum iron': 'iron',
  tibc: 'tibc', 'total iron binding capacity': 'tibc',
  tsat: 'transferrin_saturation', 'transferrin saturation': 'transferrin_saturation',
  'transferrin sat': 'transferrin_saturation', 'transferrin saturation index': 'transferrin_saturation',
  reticulocyte: 'reticulocytes', reticulocytes: 'reticulocytes', retic: 'reticulocytes',
  'reticulocyte count': 'reticulocytes', 'retic count': 'reticulocytes',
  b12: 'vitamin_b12', 'vitamin b12': 'vitamin_b12', 'vit b12': 'vitamin_b12', cobalamin: 'vitamin_b12',
  folate: 'folate', 'folic acid': 'folate', 'serum folate': 'folate',
};

// Which parameters get their status recomputed deterministically (CBC core set).
const CBC_RECOMPUTE_KEYS = new Set([
  'hemoglobin', 'hematocrit', 'rbc', 'mcv', 'mch', 'mchc', 'rdw', 'wbc', 'platelets',
]);

/** Normalize a raw parameter name/abbreviation to a canonical key, or null. */
function canonicalKey(name) {
  if (!name || typeof name !== 'string') return null;
  const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!norm) return null;
  if (SYNONYMS[norm]) return SYNONYMS[norm];
  const underscored = norm.replace(/ /g, '_');
  // Direct table key (e.g. 'total_cholesterol', 'vitamin_d')
  const { REFERENCE_RANGES } = require('../data/referenceRanges');
  if (REFERENCE_RANGES[underscored]) return underscored;
  return null;
}

/** Parse a numeric value out of a string like '9.4 g/dL', '13,500', '16.8%'. */
function parseNumeric(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/,/g, '');
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read a numeric value for a canonical key from the extracted values array.
 * @returns {{value:number|null, unit:string, raw:string}}
 */
function readNumeric(values, key) {
  if (!Array.isArray(values)) return { value: null, unit: '', raw: '' };
  for (const item of values) {
    const k = canonicalKey(item.parameter) || canonicalKey(item.abbreviation);
    if (k === key) {
      return { value: parseNumeric(item.value), unit: item.unit || '', raw: String(item.value ?? '') };
    }
  }
  return { value: null, unit: '', raw: '' };
}

/**
 * Deterministic status for ONE parameter given its numeric value + demographics.
 * @returns 'normal'|'low'|'high'|'critical_low'|'critical_high'|null (no known range)
 */
function statusByRule(paramKey, numericValue, { gender } = {}) {
  const r = resolveRange(paramKey, { gender });
  if (!r || numericValue == null) return null;
  if (r.critical_low != null && numericValue < r.critical_low) return 'critical_low';
  if (r.critical_high != null && numericValue > r.critical_high) return 'critical_high';
  if (r.low != null && numericValue < r.low) return 'low';
  if (r.high != null && numericValue > r.high) return 'high';
  return 'normal';
}

/**
 * Return a NEW extracted-values array with CBC statuses overridden by rule.
 * Non-CBC params (or those without a known range) keep their original status.
 */
function recomputeStatuses(values, { gender } = {}) {
  if (!Array.isArray(values)) return values;
  return values.map((item) => {
    const key = canonicalKey(item.parameter) || canonicalKey(item.abbreviation);
    if (!key || !CBC_RECOMPUTE_KEYS.has(key)) return item;
    const num = parseNumeric(item.value);
    const ruleStatus = statusByRule(key, num, { gender });
    if (!ruleStatus) return item;
    return { ...item, status: ruleStatus };
  });
}

// ── Anemia classification ─────────────────────────────────────────────────────

function isFemale(gender) { return String(gender || '').toLowerCase().startsWith('f'); }

/** Coerce a profile age to a finite number of years, or null (guards Number(null)===0). */
function toAge(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Resolve the WHO 2024 anemia cutoff, age- and sex-adjusted, plus a basis label.
 * Age bands (WHO 2024 haemoglobin cutoffs): 6–23mo <10.5, 2–4y <11.0,
 * 5–11y <11.5, 12–14y <12.0; then adult sex/pregnancy cutoffs.
 */
function resolveCutoff({ gender, pregnant, age }) {
  const a = toAge(age);
  if (a != null && a < 15) {
    if (a < 2)  return { cutoff: 10.5, basis: 'child_6_23mo' };
    if (a < 5)  return { cutoff: 11.0, basis: 'child_2_4y' };
    if (a < 12) return { cutoff: 11.5, basis: 'child_5_11y' };
    return { cutoff: 12.0, basis: 'adolescent_12_14y' };
  }
  if (isFemale(gender)) {
    if (pregnant === true) return { cutoff: 11.0, basis: 'pregnant_female' };
    // pregnant null/unknown → non-pregnant (more sensitive = conservative)
    return { cutoff: 12.0, basis: 'non_pregnant_female' };
  }
  // male or unknown gender → male cutoff
  return { cutoff: 13.0, basis: gender ? 'male' : 'unknown_gender_male_default' };
}

/**
 * WHO 2011 VMNIS severity band. `lowerScale` (pregnant or child <15y) uses the
 * ~1 g/dL-lower scale (severe <7, moderate 7–9.9, mild 10–cutoff).
 */
function severityBand(hb, lowerScale) {
  if (lowerScale) {
    if (hb < 7.0) return 'severe';
    if (hb < 10.0) return 'moderate';
    return 'mild';
  }
  if (hb < 8.0) return 'severe';
  if (hb < 11.0) return 'moderate';
  return 'mild'; // 11.0 – cutoff
}

/** Age-adjusted upper bound for microcytosis (children have lower normal MCV). */
function microcyticThreshold(age) {
  const a = toAge(age);
  if (a == null || a >= 12) return 80;
  if (a < 2) return 72;
  if (a < 6) return 75;
  return 77; // 6–11y
}

const TYPE_LABELS = {
  iron_deficiency_confirmed: 'Iron-deficiency anemia (confirmed)',
  iron_deficiency_suspected: 'Iron-deficiency pattern (unconfirmed)',
  b12_folate_deficiency: 'Macrocytic pattern — possible B12/folate deficiency',
  anemia_of_chronic_disease: 'Normocytic anemia — possible chronic disease / inflammation',
  unspecified: 'Anemia, type unclassified',
};

/**
 * Classify anemia deterministically from extracted CBC (+ iron studies) values.
 * @param {Array} extractedValues  {parameter, abbreviation, value, unit}[]
 * @param {Object|null} patientProfile  {gender, pregnant, ...}
 * @returns {Object} the analysis.anemia object
 */
function classifyAnemia(extractedValues, patientProfile) {
  const gender = patientProfile?.gender ?? null;
  const pregnant = patientProfile?.pregnant ?? null;
  const age = toAge(patientProfile?.age);
  const { cutoff, basis } = resolveCutoff({ gender, pregnant, age });
  const lowerScale = pregnant === true || (age != null && age < 15);

  const hb = readNumeric(extractedValues, 'hemoglobin');
  const mcv = readNumeric(extractedValues, 'mcv');
  const mch = readNumeric(extractedValues, 'mch');
  const rdw = readNumeric(extractedValues, 'rdw');
  const ferritin = readNumeric(extractedValues, 'ferritin');
  const tsat = readNumeric(extractedValues, 'transferrin_saturation');
  const tibc = readNumeric(extractedValues, 'tibc');

  const ironStudiesPresent = [ferritin.value, tsat.value, tibc.value].some((v) => v != null);
  const sources = [SOURCES.cutoff, SOURCES.severity];

  const base = {
    anemia_present: false,
    status: 'NOT_ANEMIC',
    type: null,
    type_label: null,
    severity: null,
    morphology: null,
    hemoglobin: { value: hb.value, unit: hb.unit || 'g/dL', cutoff, applied_cutoff_basis: basis },
    indices: { mcv: mcv.value, mch: mch.value, rdw: rdw.value },
    iron_studies_present: ironStudiesPresent,
    confidence: 'high',
    defer_to_physician: false,
    deferral_reason: null,
    recommendation: null,
    explanation_seed: '',
    sources,
    computed_at: null, // stamped by the caller (pure fn — no Date.now here)
  };

  // 1. Hemoglobin missing / unparseable → cannot determine anything.
  if (hb.value == null) {
    return {
      ...base,
      status: 'INCONCLUSIVE',
      confidence: 'low',
      defer_to_physician: true,
      deferral_reason: 'Hemoglobin value not found or not parseable in the report.',
      recommendation: 'A hemoglobin measurement is required to assess for anemia.',
      explanation_seed: 'No usable hemoglobin value was found, so anemia cannot be assessed; physician review is recommended.',
    };
  }

  // 2. Not anemic.
  if (hb.value >= cutoff) {
    return {
      ...base,
      explanation_seed: `Hemoglobin ${hb.value} g/dL is at or above the WHO ${basis.replace(/_/g, '-')} anemia cutoff of ${cutoff} g/dL, so no anemia is present.`,
    };
  }

  // 3. Anemic — severity + (age-adjusted) morphology.
  const severity = severityBand(hb.value, lowerScale);
  const microMax = microcyticThreshold(age);
  let morphology = null;
  if (mcv.value != null) {
    if (mcv.value < microMax) morphology = 'microcytic';
    else if (mcv.value > 100) morphology = 'macrocytic';
    else morphology = 'normocytic';
  }

  const result = {
    ...base,
    anemia_present: true,
    severity,
    morphology,
    sources: [...sources],
  };

  const mchLow = mch.value != null && mch.value < 27;
  const rdwHigh = rdw.value != null && rdw.value > 14.5;

  // 4. Type + confirmation logic.
  if (morphology === 'microcytic') {
    // Iron-deficiency pattern.
    result.type = 'iron_deficiency';
    result.sources.push(SOURCES.confirm);
    if (ironStudiesPresent) {
      const ferritinLow = ferritin.value != null && ferritin.value < 45;
      const ferritinHigh = ferritin.value != null && ferritin.value >= 100;
      const tsatLow = tsat.value != null && tsat.value < 20;
      if (ferritinLow || tsatLow) {
        result.status = 'CONFIRMED';
        result.type_label = TYPE_LABELS.iron_deficiency_confirmed;
        result.confidence = 'high';
        result.recommendation = 'Iron-deficiency anemia confirmed by iron studies. Discuss iron replacement and, in adults, evaluation for a source of blood loss with your physician.';
        result.explanation_seed = `Hemoglobin ${hb.value} g/dL (below the ${cutoff} g/dL cutoff) with microcytic indices (MCV ${mcv.value}) and low iron stores (ferritin ${ferritin.value ?? 'n/a'} ng/mL) confirm ${severity} iron-deficiency anemia.`;
      } else if (ferritinHigh) {
        // CBC pattern and iron studies disagree.
        result.status = 'INCONCLUSIVE';
        result.type_label = TYPE_LABELS.unspecified;
        result.confidence = 'low';
        result.defer_to_physician = true;
        result.deferral_reason = 'Microcytic red cells but iron stores are not low (ferritin normal/high) — the picture is inconsistent with simple iron deficiency (consider thalassemia or anemia of chronic disease).';
        result.recommendation = 'Refer to a physician; consider hemoglobin electrophoresis / inflammatory workup.';
        result.explanation_seed = `Microcytic anemia (MCV ${mcv.value}) with a non-low ferritin (${ferritin.value} ng/mL) does not fit iron deficiency; the cause is inconclusive and needs physician evaluation.`;
      } else {
        result.status = 'SUSPECTED';
        result.type_label = TYPE_LABELS.iron_deficiency_suspected;
        result.confidence = 'moderate';
        result.recommendation = 'Iron studies are indeterminate. Physician review recommended to confirm iron-deficiency vs. other microcytic causes.';
        result.explanation_seed = `Microcytic anemia (MCV ${mcv.value}) fits an iron-deficiency pattern, but the available iron studies are indeterminate.`;
      }
    } else {
      result.status = 'SUSPECTED';
      result.type_label = TYPE_LABELS.iron_deficiency_suspected;
      result.confidence = (mchLow || rdwHigh) ? 'moderate' : 'low';
      result.recommendation = 'Order an iron panel (ferritin, TIBC, transferrin saturation, reticulocytes) to confirm iron-deficiency anemia.';
      result.explanation_seed = `Hemoglobin ${hb.value} g/dL with microcytic indices (MCV ${mcv.value}${mchLow ? `, low MCH ${mch.value}` : ''}${rdwHigh ? `, high RDW ${rdw.value}` : ''}) fits a ${severity} iron-deficiency pattern that is not yet confirmed by iron studies.`;
    }
  } else if (morphology === 'macrocytic') {
    result.type = 'b12_folate_deficiency';
    result.status = 'SUSPECTED';
    result.type_label = TYPE_LABELS.b12_folate_deficiency;
    result.confidence = 'moderate';
    result.recommendation = 'Check vitamin B12 and folate levels to evaluate a macrocytic (B12/folate-deficiency) anemia.';
    result.explanation_seed = `Hemoglobin ${hb.value} g/dL with a high MCV (${mcv.value}) indicates a ${severity} macrocytic anemia, commonly from B12 or folate deficiency; confirmatory levels are needed.`;
  } else if (morphology === 'normocytic') {
    result.type = 'anemia_of_chronic_disease';
    result.status = 'SUSPECTED';
    result.type_label = TYPE_LABELS.anemia_of_chronic_disease;
    result.confidence = 'low';
    result.recommendation = 'Normocytic anemia has many causes (chronic disease, kidney disease, acute blood loss). Physician evaluation is recommended.';
    result.explanation_seed = `Hemoglobin ${hb.value} g/dL with a normal MCV (${mcv.value}) is a ${severity} normocytic anemia; common causes include chronic disease or kidney impairment and warrant physician review.`;
  } else {
    // Anemia present but morphology unknown (no MCV) → cannot classify type.
    result.type = 'unspecified';
    result.status = 'SUSPECTED';
    result.type_label = TYPE_LABELS.unspecified;
    result.confidence = 'low';
    result.defer_to_physician = true;
    result.deferral_reason = 'Red-cell indices (MCV) are unavailable, so the anemia type cannot be classified.';
    result.recommendation = 'Obtain a full CBC with red-cell indices (MCV, MCH, RDW) and an iron panel; physician review recommended.';
    result.explanation_seed = `Hemoglobin ${hb.value} g/dL indicates ${severity} anemia, but without MCV the type cannot be determined; physician evaluation is recommended.`;
  }

  // 5. Conservative escalation: severe anemia always warrants physician review.
  if (severity === 'severe' && !result.defer_to_physician) {
    result.defer_to_physician = true;
    result.deferral_reason = 'Severe anemia — prompt physician evaluation is recommended regardless of type.';
  }

  return result;
}

module.exports = {
  classifyAnemia,
  recomputeStatuses,
  statusByRule,
  canonicalKey,
  parseNumeric,
  readNumeric,
};
