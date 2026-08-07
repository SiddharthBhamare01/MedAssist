/**
 * runForecast.js — validation harness for the deterministic recovery-forecast engine.
 *
 * Pure (no server, no DB). Runs forecastRecovery over the labeled journeys and
 * reports per-status accuracy plus the two safety gates that actually matter.
 *
 * This is NOT a diagnostic classifier, so it reports no sensitivity/specificity —
 * those numbers would be meaningless here. What it reports is refusal discipline:
 * how often the engine declined to project a recovery it could not support.
 *
 * Exits non-zero on either UNSAFE class:
 *   1. A missed non-responder — expected NOT_RESPONDING, got anything else.
 *      (The analogue of a false negative: a patient told they are on track.)
 *   2. A forecast emitted on a trajectory that cannot support one — a falling
 *      hemoglobin, a moved cutoff, a non-iron anemia, or a declared non-responder.
 * ...or if overall field accuracy < THRESHOLD.
 *
 * Run: node tests/recovery/runForecast.js
 */

const { forecastRecovery } = require('../../services/recoveryForecast');
const { FIXTURES } = require('./fixtures');

const THRESHOLD = 0.90;
const CHECK_FIELDS = ['responder_status', 'trend', 'has_forecast', 'defer_to_physician'];

let fieldChecks = 0, fieldPass = 0;
const mismatches = [];
const missedNonResponders = [];
const unsafeForecasts = [];
const byStatus = {};   // responder_status → {pass, total}
const byTrend = {};    // trend → {pass, total}

let forecastsOffered = 0, forecastsWithheld = 0;

function bump(map, key, ok) {
  if (key == null) key = 'null';
  map[key] = map[key] || { pass: 0, total: 0 };
  map[key].total += 1;
  if (ok) map[key].pass += 1;
}

for (const fx of FIXTURES) {
  const got = forecastRecovery(fx.days, {
    type: fx.type,
    cutoff: fx.cutoff,
    mixedBasis: fx.mixedBasis || false,
  });
  const exp = fx.expected;
  const hasForecast = !!got.forecast;

  // Flatten the derived boolean so it can be checked like any other field.
  const actual = { ...got, has_forecast: hasForecast };

  // ── Safety gate 1: a non-responder must never be reported as anything else ──
  if (exp.responder_status === 'NOT_RESPONDING' && got.responder_status !== 'NOT_RESPONDING') {
    missedNonResponders.push(`${fx.id} (got ${got.responder_status})`);
  }

  // ── Safety gate 2: a forecast must never survive a disqualifying condition ──
  if (hasForecast) {
    forecastsOffered += 1;
    const reasons = [];
    if (got.trend === 'worsening') reasons.push('hemoglobin is falling');
    if (fx.mixedBasis) reasons.push('cutoff moved across the series');
    if (fx.type !== 'iron_deficiency') reasons.push(`type is ${fx.type}`);
    if (got.responder_status === 'NOT_RESPONDING') reasons.push('declared non-responder');
    if (reasons.length) unsafeForecasts.push(`${fx.id}: ${reasons.join('; ')}`);
  } else {
    forecastsWithheld += 1;
  }

  // ── Field-level accuracy ───────────────────────────────────────────────────
  for (const f of CHECK_FIELDS) {
    if (!(f in exp)) continue;
    fieldChecks += 1;
    const ok = actual[f] === exp[f];
    if (ok) fieldPass += 1;
    else mismatches.push(`  [${fx.id}] ${f}: expected ${JSON.stringify(exp[f])}, got ${JSON.stringify(actual[f])}`);
  }

  bump(byStatus, exp.responder_status, got.responder_status === exp.responder_status);
  if ('trend' in exp) bump(byTrend, exp.trend, got.trend === exp.trend);
}

const fieldAccuracy = fieldChecks > 0 ? fieldPass / fieldChecks : 1;

function table(title, map) {
  console.log(`\n${title}`);
  for (const [k, s] of Object.entries(map)) {
    console.log(`  ${k.padEnd(24)} ${s.pass}/${s.total} (${Math.round((s.pass / s.total) * 100)}%)`);
  }
}

console.log('='.repeat(60));
console.log(`RECOVERY FORECAST VALIDATION — ${FIXTURES.length} synthetic journeys`);
console.log('='.repeat(60));

console.log('\nSafety gates:');
console.log(`  Missed non-responders     : ${missedNonResponders.length}${missedNonResponders.length ? ' → ' + missedNonResponders.join(', ') : ''}`);
console.log(`  Unsupportable forecasts   : ${unsafeForecasts.length}${unsafeForecasts.length ? '' : ''}`);
if (unsafeForecasts.length) console.log('    ' + unsafeForecasts.join('\n    '));

console.log('\nForecast discipline:');
console.log(`  Offered                   : ${forecastsOffered}/${FIXTURES.length}`);
console.log(`  Withheld                  : ${forecastsWithheld}/${FIXTURES.length}`);

table('Responder-status accuracy:', byStatus);
table('Trend accuracy:', byTrend);

console.log(`\nOverall field accuracy: ${fieldPass}/${fieldChecks} (${(fieldAccuracy * 100).toFixed(1)}%)`);
if (mismatches.length) {
  console.log('\nMismatches:');
  console.log(mismatches.join('\n'));
}

// ── Pass/fail ────────────────────────────────────────────────────────────────
const unsafe = missedNonResponders.length + unsafeForecasts.length;
const failed = unsafe > 0 || fieldAccuracy < THRESHOLD;
console.log('\n' + '='.repeat(60));
if (failed) {
  console.log(`RESULT: FAIL  (${missedNonResponders.length} missed non-responders, ${unsafeForecasts.length} unsupportable forecasts, field accuracy ${(fieldAccuracy * 100).toFixed(1)}%)`);
  process.exit(1);
} else {
  console.log(`RESULT: PASS  (0 missed non-responders, 0 unsupportable forecasts, field accuracy ${(fieldAccuracy * 100).toFixed(1)}%)`);
  process.exit(0);
}
