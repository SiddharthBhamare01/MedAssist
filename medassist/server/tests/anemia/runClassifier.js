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

const { classifyAnemia } = require('../../services/anemiaClassifier');
const { FIXTURES } = require('./fixtures');

const THRESHOLD = 0.90;
const CHECK_FIELDS = ['anemia_present', 'status', 'severity', 'morphology', 'type'];

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

// ── Pass/fail ────────────────────────────────────────────────────────────────
const failed = fn > 0 || fieldAccuracy < THRESHOLD;
console.log('\n' + '='.repeat(60));
if (failed) {
  console.log(`RESULT: FAIL  (FN=${fn}, field accuracy ${(fieldAccuracy * 100).toFixed(1)}% < ${THRESHOLD * 100}%)`);
  process.exit(1);
} else {
  console.log(`RESULT: PASS  (0 false negatives, field accuracy ${(fieldAccuracy * 100).toFixed(1)}%)`);
  process.exit(0);
}
