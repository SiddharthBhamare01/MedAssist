/**
 * runDisagreement.js — validation harness for utils/ensembleMetrics.
 *
 * Pure (no server, no DB, no network). Feeds synthetic agent outputs whose true
 * agreement is known by construction and checks the measured disagreement rate.
 *
 * This validates the INSTRUMENT, not the ensemble. The production figure comes
 * from real runs — the `[ensembleMetrics]` line in the server log — and needs a
 * sample of live analyses before it can answer the review's question of whether
 * the providers are worth their cost.
 *
 * Run: node tests/ensemble/runDisagreement.js
 */

const { measureDisagreement, formatDisagreement, leavesAgree } = require('../../utils/ensembleMetrics');

const out = (providerName, obj) => ({ providerName, output: JSON.stringify(obj) });

let pass = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`  ${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('='.repeat(60));
console.log('ENSEMBLE DISAGREEMENT METRIC');
console.log('='.repeat(60) + '\n');

// ── 1. Identical outputs → 0% disagreement ───────────────────────────────────
const same = { summary: { assessment: 'Mild anemia' }, values: [{ p: 'Hb', v: 9.1 }] };
let m = measureDisagreement([out('groq', same), out('cerebras', same)]);
check('identical outputs → 0% disagreement', m.disagreement_rate === 0, `got ${m.disagreement_rate}`);
check('identical outputs → exact_match true', m.exact_match === true);

// ── 2. Numeric tolerance: 9.1 vs 9.10 agree ──────────────────────────────────
m = measureDisagreement([
  out('groq', { v: 9.1 }),
  out('cerebras', { v: 9.10 }),
]);
check('9.1 vs 9.10 → agreement', m.disagreement_rate === 0, `got ${m.disagreement_rate}`);
check('9.1 vs 12.0 → disagreement', measureDisagreement([
  out('groq', { v: 9.1 }), out('cerebras', { v: 12.0 }),
]).disagreement_rate === 1);

// ── 3. Half the fields differ → 50% ──────────────────────────────────────────
m = measureDisagreement([
  out('groq',     { a: 'same', b: 'left' }),
  out('cerebras', { a: 'same', b: 'right' }),
]);
check('1 of 2 fields differs → 50% disagreement', m.disagreement_rate === 0.5, `got ${m.disagreement_rate}`);
check('conflict is reported with both values',
  m.sample_conflicts.length === 1 && m.sample_conflicts[0].values.length === 2);

// ── 4. Case/whitespace insensitivity for prose ───────────────────────────────
check('prose differing only by case/space agrees',
  leavesAgree('Mild  Anemia', 'mild anemia'));

// ── 5. Structural difference: one provider omits a field ─────────────────────
m = measureDisagreement([
  out('groq',     { a: 1, b: 2 }),
  out('cerebras', { a: 1 }),
]);
check('missing field lowers structural agreement', m.structural_agreement === 0.5,
  `got ${m.structural_agreement}`);
check('shared fields still compared', m.shared_leaf_count === 1);

// ── 6. Fewer than two providers → null, not 0% ───────────────────────────────
check('single provider → null (not a 0% claim)',
  measureDisagreement([out('groq', same)]) === null);
check('empty input → null', measureDisagreement([]) === null);

// ── 7. Unparseable output is reported, not silently dropped ──────────────────
m = measureDisagreement([
  out('groq', same),
  { providerName: 'cerebras', output: 'I could not complete this request.' },
]);
check('one unparseable output → not comparable', m.comparable === false);
check('unparseable provider is named', m.unparseable_providers.includes('cerebras'));

// ── 8. Array ordering counts as disagreement ─────────────────────────────────
m = measureDisagreement([
  out('groq',     { list: ['Anemia', 'Thyroid'] }),
  out('cerebras', { list: ['Thyroid', 'Anemia'] }),
]);
check('different array order → disagreement', m.disagreement_rate === 1, `got ${m.disagreement_rate}`);

// ── 9. Log line formats without throwing ─────────────────────────────────────
const line = formatDisagreement(m, 'blood_analysis');
check('formatDisagreement produces a log line', typeof line === 'string' && line.includes('disagreement'));
check('formatDisagreement(null) → null', formatDisagreement(null, 'x') === null);

console.log('\n' + '='.repeat(60));
const total = pass + failures.length;
console.log(`Checks passed: ${pass}/${total}`);
if (failures.length) {
  console.log('\nFailures:\n' + failures.join('\n'));
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('RESULT: PASS');
console.log('\nNote: this validates the measurement, not the ensemble. The production');
console.log('disagreement rate comes from [ensembleMetrics] lines in the server log');
console.log('over a sample of real analyses, and is still unmeasured.');
process.exit(0);
