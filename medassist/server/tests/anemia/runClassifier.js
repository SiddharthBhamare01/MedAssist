/**
 * runClassifier.js — validation harness for the deterministic anemia classifier.
 *
 * Pure (no server, no DB). Runs classifyAnemia over the labeled fixtures and
 * reports a confusion matrix (sensitivity / specificity / FN / FP) plus
 * per-severity, per-morphology, and status accuracy. Exits non-zero on any
 * false negative (safety-critical) or if overall field accuracy < THRESHOLD.
 *
 * Run: node tests/anemia/runClassifier.js
 */

const { classifyAnemia, recomputeStatuses } = require('../../services/anemiaClassifier');
const { FIXTURES, RANGE_FIXTURES } = require('./fixtures');

const THRESHOLD = 0.90;
const CHECK_FIELDS = ['anemia_present', 'status', 'severity', 'morphology', 'type', 'dietary_guidance'];

let tp = 0, fp = 0, tn = 0, fn = 0;
let fieldChecks = 0, fieldPass = 0;
const falseNegatives = [];
const mismatches = [];
const bySeverity = {};   // severity → {pass, total}
const byMorph = {};      // morphology → {pass, total}
const byStatus = {};     // status → {pass, total}

function bump(map, key, ok) {
  if (key == null) key = 'null';
  map[key] = map[key] || { pass: 0, total: 0 };
  map[key].total += 1;
  if (ok) map[key].pass += 1;
}

for (const fx of FIXTURES) {
  const got = classifyAnemia(fx.values, fx.profile);
  const exp = fx.expected;

  // Binary confusion matrix (anemia present vs absent)
  if (exp.anemia_present && got.anemia_present) tp += 1;
  else if (!exp.anemia_present && got.anemia_present) fp += 1;
  else if (!exp.anemia_present && !got.anemia_present) tn += 1;
  else { fn += 1; falseNegatives.push(fx.id); }

  // Field-level accuracy
  for (const f of CHECK_FIELDS) {
    if (!(f in exp)) continue;
    fieldChecks += 1;
    const ok = got[f] === exp[f];
    if (ok) fieldPass += 1;
    else mismatches.push(`  [${fx.id}] ${f}: expected ${JSON.stringify(exp[f])}, got ${JSON.stringify(got[f])}`);
  }
  // Optional defer_to_physician check
  if ('defer_to_physician' in exp && got.defer_to_physician !== exp.defer_to_physician) {
    mismatches.push(`  [${fx.id}] defer_to_physician: expected ${exp.defer_to_physician}, got ${got.defer_to_physician}`);
  }

  const severityOk = got.severity === exp.severity;
  const morphOk = got.morphology === exp.morphology;
  const statusOk = got.status === exp.status;
  bump(bySeverity, exp.severity, severityOk);
  bump(byMorph, exp.morphology, morphOk);
  bump(byStatus, exp.status, statusOk);
}

const sensitivity = tp + fn > 0 ? tp / (tp + fn) : 1;
const specificity = tn + fp > 0 ? tn / (tn + fp) : 1;
const fieldAccuracy = fieldChecks > 0 ? fieldPass / fieldChecks : 1;

function table(title, map) {
  console.log(`\n${title}`);
  for (const [k, s] of Object.entries(map)) {
    console.log(`  ${k.padEnd(24)} ${s.pass}/${s.total} (${Math.round((s.pass / s.total) * 100)}%)`);
  }
}

console.log('='.repeat(60));
console.log(`ANEMIA CLASSIFIER VALIDATION — ${FIXTURES.length} synthetic CBC cases`);
console.log('='.repeat(60));
console.log('\nBinary confusion matrix (anemia present vs absent):');
console.log(`  TP=${tp}  FP=${fp}  TN=${tn}  FN=${fn}`);
console.log(`  Sensitivity (recall) : ${(sensitivity * 100).toFixed(1)}%`);
console.log(`  Specificity          : ${(specificity * 100).toFixed(1)}%`);
console.log(`  False negatives      : ${fn}${falseNegatives.length ? ' → ' + falseNegatives.join(', ') : ''}`);
console.log(`  False positives      : ${fp}`);

table('Severity accuracy:', bySeverity);
table('Morphology accuracy:', byMorph);
table('Status accuracy:', byStatus);

console.log(`\nOverall field accuracy: ${fieldPass}/${fieldChecks} (${(fieldAccuracy * 100).toFixed(1)}%)`);
if (mismatches.length) {
  console.log('\nMismatches:');
  console.log(mismatches.join('\n'));
}

// ── Reference-range suite ────────────────────────────────────────────────────
// The classifier fixtures above carry no printed range, so they exercise only
// the curated-table path. These cases cover the report-printed range and the
// disclosed fallback.
console.log('\n' + '='.repeat(60));
console.log(`REFERENCE RANGE RESOLUTION — ${RANGE_FIXTURES.length} cases`);
console.log('='.repeat(60));

let rangePass = 0;
const rangeFails = [];
for (const fx of RANGE_FIXTURES) {
  const [out] = recomputeStatuses(fx.values, { gender: fx.profile?.gender });
  const gotStatus = out.status;
  const gotSource = out.range_source ?? '(none)';
  const ok = gotStatus === fx.expected.status && gotSource === fx.expected.range_source;
  if (ok) rangePass += 1;
  else rangeFails.push(`  ${fx.id}: expected ${fx.expected.status}/${fx.expected.range_source}, got ${gotStatus}/${gotSource}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${fx.id.padEnd(32)} ${String(gotStatus).padEnd(14)} range from: ${gotSource}`);
}
console.log(`\nReference-range accuracy: ${rangePass}/${RANGE_FIXTURES.length}`);
if (rangeFails.length) console.log(rangeFails.join('\n'));

// ── Pass/fail ────────────────────────────────────────────────────────────────
const rangeFailed = rangePass < RANGE_FIXTURES.length;
const failed = fn > 0 || fieldAccuracy < THRESHOLD || rangeFailed;
console.log('\n' + '='.repeat(60));
if (failed) {
  const why = [
    fn > 0 ? `FN=${fn}` : null,
    fieldAccuracy < THRESHOLD ? `field accuracy ${(fieldAccuracy * 100).toFixed(1)}% < ${THRESHOLD * 100}%` : null,
    rangeFailed ? `range resolution ${rangePass}/${RANGE_FIXTURES.length}` : null,
  ].filter(Boolean).join(', ');
  console.log(`RESULT: FAIL  (${why})`);
  process.exit(1);
} else {
  console.log(`RESULT: PASS  (0 false negatives, field accuracy ${(fieldAccuracy * 100).toFixed(1)}%, range resolution ${rangePass}/${RANGE_FIXTURES.length})`);
  process.exit(0);
}
