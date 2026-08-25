/**
 * extractionValidator.js — refuses OCR output that was invented rather than read.
 *
 * The known failure (docs/CHECKPOINT-05 §6b): a blank or unreadable image makes
 * the vision model return a full set of plausible lab values copied from the
 * few-shot example in the prompt. Nothing validated that, so the values were
 * persisted, the deterministic classifier built a confident WHO-cited anemia
 * determination on numbers that were never on the page, and the image was
 * already deleted so no one could check.
 *
 * Every safeguard in this product assumes the extracted numbers are real. This
 * module is what makes that assumption checkable.
 *
 * The design rule is asymmetric on purpose: **refusing a readable report is an
 * inconvenience; accepting an invented one is a fabricated diagnosis.** So the
 * checks below are conservative where the signal is unambiguous (nothing
 * extracted, no numbers anywhere, values matching the prompt's own example) and
 * deliberately permissive elsewhere — a real report with one odd row still gets
 * through.
 *
 * Pure functions, no network and no DB, so tests/ocr/runValidator.js can call
 * them directly.
 */

/**
 * Values that appeared in the extraction prompt's schema example before it was
 * changed to placeholders. A model that cannot read the image echoes these back.
 *
 * IMPORTANT — why a match alone is not enough to reject:
 *
 *   A hemoglobin of 13.2 g/dL against a 13.5–17.5 range is a perfectly ordinary
 *   real result. If a single matching row were sufficient, we would reject
 *   genuine reports from real patients, which is the one thing worse than the
 *   bug we are fixing.
 *
 *   The fabrication signature is not "contains the example" but "consists of
 *   nothing BUT the example" — a blank image yields the example rows and little
 *   else, whereas a real report that happens to include 13.2 g/dL carries a page
 *   of other readings alongside it. So the rejection below requires every
 *   numeric row to be an echo. See validateExtraction step 3.
 *
 * `unit: ''` means the row's unit must itself be empty — it is not a wildcard.
 */
const PROMPT_EXAMPLE_FINGERPRINTS = [
  { parameter: 'hemoglobin', value: '13.2', unit: 'g/dl' },
  { parameter: 'hemoglobin', value: '13.2', unit: '' },
];

/** Rejection codes — stable identifiers for the route and the tests. */
const CODES = {
  EMPTY: 'NO_VALUES_FOUND',
  NO_NUMERICS: 'NO_NUMERIC_VALUES',
  PROMPT_ECHO: 'PROMPT_EXAMPLE_ECHOED',
  PLACEHOLDER_ECHO: 'PLACEHOLDER_ECHOED',
  TOO_SPARSE: 'TOO_SPARSE_TO_TRUST',
};

/** Patient-facing message per code. Never blames the patient for a bad photo. */
const MESSAGES = {
  [CODES.EMPTY]:
    "We couldn't read any test results from this file. If it's a photo, try again in brighter light with the page flat and the whole report in frame — or upload the original PDF from your lab if you have it.",
  [CODES.NO_NUMERIC_VALUES]:
    "We found text on this page but no readable test values. Please upload a clearer photo of the results table, or the original PDF from your lab.",
  [CODES.NO_NUMERICS]:
    "We found text on this page but no readable test values. Please upload a clearer photo of the results table, or the original PDF from your lab.",
  [CODES.PROMPT_ECHO]:
    "We couldn't read this report clearly enough to trust the values. Rather than show you numbers we aren't sure about, we've stopped here. Please try a clearer photo or the original PDF.",
  [CODES.PLACEHOLDER_ECHO]:
    "We couldn't read this report clearly enough to trust the values. Rather than show you numbers we aren't sure about, we've stopped here. Please try a clearer photo or the original PDF.",
  [CODES.TOO_SPARSE]:
    "We could only read a small part of this report, and not clearly enough to rely on. Please upload a clearer photo showing the full results table, or the original PDF.",
};

/** Text a model emits when it echoes a schema placeholder instead of reading. */
const PLACEHOLDER_RE = /^\s*(<[^>]*>|\{[^}]*\}|n\/?a|none|null|undefined|value|number|parameter|string|example|xx+|\.\.\.|-{2,})\s*$/i;

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** True when a string contains a parseable number. */
function hasNumber(raw) {
  if (raw == null) return false;
  return /-?\d/.test(String(raw).replace(/,/g, ''));
}

/** True when the row looks like a placeholder rather than a reading. */
function isPlaceholderRow(row) {
  return PLACEHOLDER_RE.test(String(row?.value ?? '')) ||
         PLACEHOLDER_RE.test(String(row?.parameter ?? ''));
}

/** True when the row matches a value baked into the extraction prompt. */
function matchesPromptExample(row) {
  const p = norm(row?.parameter);
  const v = norm(row?.value);
  const u = norm(row?.unit).replace(/\s/g, '');
  // Unit is matched exactly — including the empty case. Treating '' as a
  // wildcard rejected legitimate readings in other unit systems (13.2 mmol/L).
  return PROMPT_EXAMPLE_FINGERPRINTS.some(
    (f) => p === f.parameter && v === f.value && u === f.unit.replace(/\s/g, '')
  );
}

/**
 * Decide whether an extraction can be trusted.
 *
 * @param {Array} values  raw rows from the vision extractor
 * @returns {{ok: boolean, code?: string, message?: string, reason?: string, signals: object}}
 *          `reason` is for logs and the professor's evidence package; `message`
 *          is what a patient reads.
 */
function validateExtraction(values) {
  const rows = Array.isArray(values) ? values : [];

  const withNumbers = rows.filter((r) => hasNumber(r?.value));
  const placeholders = rows.filter(isPlaceholderRow);
  const promptEchoes = rows.filter(matchesPromptExample);
  const withUnits = rows.filter((r) => norm(r?.unit) !== '');

  const signals = {
    row_count: rows.length,
    numeric_row_count: withNumbers.length,
    placeholder_row_count: placeholders.length,
    prompt_echo_count: promptEchoes.length,
    unit_row_count: withUnits.length,
  };

  // 1. Nothing came back. The correct answer for an unreadable image, and the
  //    one the prompt now asks for explicitly.
  if (rows.length === 0) {
    return { ok: false, code: CODES.EMPTY, message: MESSAGES[CODES.EMPTY], signals,
      reason: 'Extractor returned no rows' };
  }

  // 2. Rows exist but not one carries a number — text was seen, values were not.
  if (withNumbers.length === 0) {
    return { ok: false, code: CODES.NO_NUMERICS, message: MESSAGES[CODES.NO_NUMERICS], signals,
      reason: `${rows.length} row(s) returned, none containing a numeric value` };
  }

  // 3. The extraction consists of nothing but the prompt's own example — the
  //    documented blank-image failure. Requiring EVERY numeric row to be an echo
  //    is deliberate: a real report can legitimately contain 13.2 g/dL, and
  //    rejecting a genuine result is worse than the bug this guards against.
  if (promptEchoes.length > 0 && promptEchoes.length === withNumbers.length) {
    return { ok: false, code: CODES.PROMPT_ECHO, message: MESSAGES[CODES.PROMPT_ECHO], signals,
      reason: `every numeric row matches the extraction prompt's example values (${promptEchoes.map((r) => `${r.parameter}=${r.value}`).join(', ')})` };
  }

  // 4. The model echoed schema placeholders. Tolerated in a minority of rows —
  //    a real report can have one unreadable cell — but not as the bulk.
  if (placeholders.length > 0 && placeholders.length >= rows.length / 2) {
    return { ok: false, code: CODES.PLACEHOLDER_ECHO, message: MESSAGES[CODES.PLACEHOLDER_ECHO], signals,
      reason: `${placeholders.length} of ${rows.length} rows are schema placeholders rather than readings` };
  }

  // 5. A single numeric row with no unit is not a lab report. Two or more rows,
  //    or one row with a unit, is thin but plausible — a photo of one result
  //    line is a legitimate thing for a patient to upload, so it passes.
  if (withNumbers.length === 1 && withUnits.length === 0) {
    return { ok: false, code: CODES.TOO_SPARSE, message: MESSAGES[CODES.TOO_SPARSE], signals,
      reason: 'Only one numeric row and no units — too little to identify as a lab report' };
  }

  return { ok: true, signals };
}

/** One-line log summary of a validation outcome. */
function formatValidation(v) {
  const s = v.signals;
  const base = `rows=${s.row_count} numeric=${s.numeric_row_count} units=${s.unit_row_count}` +
    (s.placeholder_row_count ? ` placeholders=${s.placeholder_row_count}` : '') +
    (s.prompt_echo_count ? ` prompt_echoes=${s.prompt_echo_count}` : '');
  return v.ok
    ? `[extractionValidator] accepted — ${base}`
    : `[extractionValidator] REJECTED ${v.code} — ${v.reason} (${base})`;
}

module.exports = {
  validateExtraction,
  formatValidation,
  hasNumber,
  isPlaceholderRow,
  matchesPromptExample,
  CODES,
  MESSAGES,
  PROMPT_EXAMPLE_FINGERPRINTS,
};
