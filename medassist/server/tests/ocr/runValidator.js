/**
 * runValidator.js — validation harness for utils/extractionValidator.
 *
 * Pure (no server, no DB, no network). Feeds synthetic extractor output whose
 * trustworthiness is known by construction.
 *
 * The case that matters is BLANK-IMAGE-ECHO: the documented production failure
 * where an unreadable image returns values copied from the extraction prompt's
 * own example, which were then persisted and used to build a confident anemia
 * determination on numbers that were never on the page.
 *
 * The two directions are not symmetric and the tests reflect that: a rejected
 * real report is an inconvenience, an accepted invented one is a fabricated
 * diagnosis. So the false-accept cases are the ones that must never regress.
 *
 * Run: node tests/ocr/runValidator.js
 */

const { validateExtraction, formatValidation, CODES } = require('../../utils/extractionValidator');

const row = (parameter, value, unit = '', normal_range = '') =>
  ({ parameter, abbreviation: '', value: String(value), unit, normal_range, status: 'normal' });

let pass = 0;
const failures = [];

function expectReject(label, values, code) {
  const v = validateExtraction(values);
  const ok = !v.ok && v.code === code;
  if (ok) { pass += 1; console.log(`  PASS  reject  ${label}`); }
  else {
    failures.push(`  ${label} — expected reject ${code}, got ${v.ok ? 'ACCEPT' : v.code}`);
    console.log(`  FAIL  reject  ${label} — expected ${code}, got ${v.ok ? 'ACCEPT' : v.code}`);
  }
  if (!v.ok) {
    // A rejection the patient cannot act on is a dead end.
    const actionable = /try again|clearer|upload|brighter/i.test(v.message || '');
    if (!actionable) {
      failures.push(`  ${label} — rejection message is not actionable`);
      console.log(`  FAIL  message  ${label} — not actionable`);
    } else pass += 1;
  }
}

function expectAccept(label, values) {
  const v = validateExtraction(values);
  if (v.ok) { pass += 1; console.log(`  PASS  accept  ${label}`); }
  else {
    failures.push(`  ${label} — expected accept, got ${v.code} (${v.reason})`);
    console.log(`  FAIL  accept  ${label} — got ${v.code}`);
  }
}

console.log('='.repeat(68));
console.log('OCR EXTRACTION VALIDATOR');
console.log('='.repeat(68));

console.log('\nMust REJECT — accepting these fabricates a result:\n');

expectReject('empty array (correct answer for a blank image)', [], CODES.EMPTY);
expectReject('null / non-array from a broken extractor', null, CODES.EMPTY);

// The documented production failure.
expectReject('BLANK-IMAGE-ECHO — prompt example values returned',
  [row('Hemoglobin', '13.2', 'g/dL', '13.5–17.5')], CODES.PROMPT_ECHO);

expectReject('text seen but no numeric values anywhere',
  [row('Hemoglobin', ''), row('Patient Name', 'John Smith'), row('Lab', 'Acme Diagnostics')],
  CODES.NO_NUMERICS);

expectReject('schema placeholders echoed back',
  [row('<exact test name as printed>', '<numeric value exactly as printed>'), row('Hemoglobin', '12.0', 'g/dL')],
  CODES.PLACEHOLDER_ECHO);

expectReject('N/A padding as the bulk of the result',
  [row('Hemoglobin', 'N/A'), row('MCV', 'N/A'), row('WBC', '7.0', 'x10^3/uL')],
  CODES.PLACEHOLDER_ECHO);

expectReject('single bare number, no unit — not a lab report',
  [row('Glucose', '42')], CODES.TOO_SPARSE);

console.log('\nMust ACCEPT — rejecting these blocks a real patient:\n');

expectAccept('full CBC', [
  row('Hemoglobin', '9.1', 'g/dL', '13.5–17.5'),
  row('MCV', '76', 'fL', '80–100'),
  row('RDW', '16.0', '%', '11.5–14.5'),
  row('Platelets', '310', 'x10^3/uL', '150–400'),
  row('WBC', '6.8', 'x10^3/uL', '4.5–11.0'),
]);

expectAccept('two rows with units — a photo of a partial report', [
  row('Hemoglobin', '11.2', 'g/dL'), row('Hematocrit', '34', '%'),
]);

expectAccept('one row WITH a unit — a photo of a single result line', [
  row('Hemoglobin', '11.2', 'g/dL', '13.5–17.5'),
]);

expectAccept('one unreadable cell among many good rows', [
  row('Hemoglobin', '9.1', 'g/dL'), row('MCV', 'N/A'), row('RDW', '16.0', '%'),
  row('Platelets', '310', 'x10^3/uL'), row('WBC', '6.8', 'x10^3/uL'),
]);

expectAccept('hemoglobin 13.2 with a DIFFERENT unit is a real reading', [
  row('Hemoglobin', '13.2', 'mmol/L'), row('MCV', '88', 'fL'),
]);

// 13.2 g/dL against a 13.5-17.5 range is an ordinary real result. The blank-image
// failure returns the example and little else, so the echo rule requires EVERY
// numeric row to match. A page of other readings alongside it means it was read.
expectAccept('prompt example value among genuine other readings', [
  row('Hemoglobin', '13.2', 'g/dL', '13.5–17.5'),
  row('WBC', '7.2', 'x10^3/uL', '4.5–11.0'),
  row('Platelets', '250', 'x10^3/uL', '150–400'),
]);

expectAccept('values with thousands separators', [
  row('Platelets', '1,50,000', '/uL'), row('WBC', '7,200', '/uL'),
]);

// ── Log formatting ───────────────────────────────────────────────────────────
console.log('\nLog line:\n');
console.log('  ' + formatValidation(validateExtraction([])));
console.log('  ' + formatValidation(validateExtraction([row('Hemoglobin', '13.2', 'g/dL')])));
console.log('  ' + formatValidation(validateExtraction([row('Hemoglobin', '9.1', 'g/dL'), row('MCV', '76', 'fL')])));

console.log('\n' + '='.repeat(68));
const total = pass + failures.length;
console.log(`Checks passed: ${pass}/${total}`);
if (failures.length) {
  console.log('\nFailures:\n' + failures.join('\n'));
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('RESULT: PASS');
console.log('\nNote: this validates the gate against synthetic extractor output. Whether');
console.log('the vision model now returns [] for a genuinely blurred photograph is a');
console.log('separate question, answered by tests/ocr/runExtractionAccuracy.js once the');
console.log('photographs exist. The gate holds either way — it does not depend on the');
console.log('model having obeyed the refusal instruction.');
process.exit(0);
