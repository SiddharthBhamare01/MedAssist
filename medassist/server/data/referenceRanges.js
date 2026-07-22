/**
 * referenceRanges.js — single source of truth for lab reference ranges.
 *
 * Extracted from agents/tools/medicalTools.js so both the tool layer and the
 * deterministic anemia classifier (services/anemiaClassifier.js) share one table.
 *
 * `parseRangeString` mirrors the frontend parser in
 * client/src/components/ParameterProgress.jsx (parseNormalRange) so backend and
 * frontend agree on how a range string maps to {low, high}.
 */

// ── Reference Range Table ─────────────────────────────────────────────────────
const REFERENCE_RANGES = {
  // CBC
  hemoglobin:         { male: '13.5–17.5 g/dL', female: '12.0–15.5 g/dL', unit: 'g/dL', critical_low: 7, critical_high: 20 },
  hematocrit:         { male: '41–53%', female: '36–46%', unit: '%' },
  wbc:                { normal: '4.5–11.0 x10³/μL', unit: 'x10³/μL', critical_low: 2, critical_high: 30 },
  rbc:                { male: '4.5–5.5 x10⁶/μL', female: '4.0–5.0 x10⁶/μL', unit: 'x10⁶/μL' },
  platelets:          { normal: '150–400 x10³/μL', unit: 'x10³/μL', critical_low: 50, critical_high: 1000 },
  mcv:                { normal: '80–100 fL', unit: 'fL' },
  mch:                { normal: '27–33 pg', unit: 'pg' },       // added — iron-deficiency index (distinct from MCHC)
  mchc:               { normal: '32–36 g/dL', unit: 'g/dL' },
  rdw:                { normal: '11.5–14.5 %', unit: '%' },     // added — RDW-CV, iron-deficiency index
  // Glucose / Diabetes
  glucose:            { fasting: '70–99 mg/dL', random: '<200 mg/dL', unit: 'mg/dL', critical_low: 40, critical_high: 500 },
  hba1c:              { normal: '<5.7%', prediabetes: '5.7–6.4%', diabetes: '≥6.5%', unit: '%' },
  insulin:            { fasting: '2.6–24.9 μIU/mL', unit: 'μIU/mL' },
  // Basic Metabolic Panel
  sodium:             { normal: '136–145 mEq/L', unit: 'mEq/L', critical_low: 120, critical_high: 160 },
  potassium:          { normal: '3.5–5.0 mEq/L', unit: 'mEq/L', critical_low: 2.5, critical_high: 6.5 },
  chloride:           { normal: '98–106 mEq/L', unit: 'mEq/L' },
  bicarbonate:        { normal: '22–29 mEq/L', unit: 'mEq/L' },
  bun:                { normal: '7–20 mg/dL', unit: 'mg/dL', critical_high: 100 },
  creatinine:         { male: '0.74–1.35 mg/dL', female: '0.59–1.04 mg/dL', unit: 'mg/dL', critical_high: 10 },
  gfr:                { normal: '>60 mL/min/1.73m²', unit: 'mL/min/1.73m²', critical_low: 15 },
  // Liver Function
  alt:                { male: '7–56 U/L', female: '7–45 U/L', unit: 'U/L', critical_high: 1000 },
  ast:                { normal: '10–40 U/L', unit: 'U/L', critical_high: 1000 },
  bilirubin_total:    { normal: '0.1–1.2 mg/dL', unit: 'mg/dL', critical_high: 15 },
  alkaline_phosphatase: { normal: '44–147 U/L', unit: 'U/L' },
  albumin:            { normal: '3.4–5.4 g/dL', unit: 'g/dL', critical_low: 2.0 },
  total_protein:      { normal: '6.3–8.2 g/dL', unit: 'g/dL' },
  // Lipid Panel
  total_cholesterol:  { normal: '<200 mg/dL', borderline: '200–239 mg/dL', high: '≥240 mg/dL', unit: 'mg/dL' },
  ldl:                { optimal: '<100 mg/dL', near_optimal: '100–129 mg/dL', high: '≥160 mg/dL', unit: 'mg/dL' },
  hdl:                { male_low: '<40 mg/dL', female_low: '<50 mg/dL', protective: '>60 mg/dL', unit: 'mg/dL' },
  triglycerides:      { normal: '<150 mg/dL', high: '200–499 mg/dL', unit: 'mg/dL', critical_high: 1000 },
  // Thyroid
  tsh:                { normal: '0.4–4.0 mIU/L', unit: 'mIU/L', critical_low: 0.01, critical_high: 100 },
  t3_free:            { normal: '2.3–4.1 pg/mL', unit: 'pg/mL' },
  t4_free:            { normal: '0.8–1.8 ng/dL', unit: 'ng/dL' },
  // Minerals & Vitamins
  calcium:            { normal: '8.5–10.2 mg/dL', unit: 'mg/dL', critical_low: 7, critical_high: 13 },
  magnesium:          { normal: '1.7–2.2 mg/dL', unit: 'mg/dL' },
  phosphorus:         { normal: '2.5–4.5 mg/dL', unit: 'mg/dL' },
  vitamin_d:          { deficient: '<20 ng/mL', insufficient: '20–29 ng/mL', normal: '30–100 ng/mL', unit: 'ng/mL' },
  vitamin_b12:        { normal: '200–900 pg/mL', unit: 'pg/mL', critical_low: 150 },
  iron:               { male: '65–175 μg/dL', female: '50–170 μg/dL', unit: 'μg/dL' },
  ferritin:           { male: '12–300 ng/mL', female: '12–150 ng/mL', unit: 'ng/mL' },
  // Inflammation
  crp:                { normal: '<1.0 mg/L', elevated: '1.0–3.0 mg/L', high: '>3.0 mg/L', unit: 'mg/L' },
  esr:                { male: '0–22 mm/hr', female: '0–29 mm/hr', unit: 'mm/hr' },
  // Other
  uric_acid:          { male: '3.4–7.0 mg/dL', female: '2.4–6.0 mg/dL', unit: 'mg/dL', critical_high: 12 },
  ldh:                { normal: '140–280 U/L', unit: 'U/L' },
  inr:                { normal: '0.9–1.1', therapeutic: '2.0–3.0 (anticoagulation)', unit: 'ratio' },
};

/**
 * Parse a range string like '13.5–17.5 g/dL', '<200 mg/dL', or '>60 mL/min'
 * into { low, high }. Handles en-dash / hyphen and >, ≥, <, ≤ prefixes.
 * Returns null if the string carries no parseable numeric bound.
 */
function parseRangeString(r) {
  if (!r || typeof r !== 'string') return null;
  const m = r.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) };
  const gt = r.match(/[>≥]=?\s*([\d.]+)/);
  if (gt) return { low: parseFloat(gt[1]), high: null };
  const lt = r.match(/[<≤]=?\s*([\d.]+)/);
  if (lt) return { low: null, high: parseFloat(lt[1]) };
  return null;
}

/**
 * Resolve the numeric reference band for a canonical parameter key, picking the
 * gender-specific range when the table provides one.
 * @param {string} paramKey  canonical key (e.g. 'hemoglobin')
 * @param {{gender?: string}} demo
 * @returns {{low, high, critical_low, critical_high, unit}|null}
 */
function resolveRange(paramKey, { gender } = {}) {
  const r = REFERENCE_RANGES[paramKey];
  if (!r) return null;
  const isFemale = String(gender || '').toLowerCase().startsWith('f');
  const raw = isFemale ? (r.female || r.normal) : (r.male || r.normal);
  const parsed = parseRangeString(raw);
  if (!parsed) return null;
  return {
    low: parsed.low,
    high: parsed.high,
    critical_low: r.critical_low ?? null,
    critical_high: r.critical_high ?? null,
    unit: r.unit,
  };
}

module.exports = { REFERENCE_RANGES, parseRangeString, resolveRange };
