/**
 * runExtractionAccuracy.js — per-parameter OCR extraction accuracy on real photographs.
 *
 * Phase 2 faculty review (Dr. Leibovitz, Aug 2026):
 *
 *   "Report per-parameter extraction accuracy on real photographs featuring
 *    glare, skew, curl, and multi-column layouts rather than on clean scans."
 *
 * This harness is the measuring instrument. **The photographs are the missing
 * input and have to be collected by hand** — see tests/ocr/README.md. Running it
 * without a labels.json exits 2 and says what is needed, rather than reporting a
 * fake pass.
 *
 * Unlike the other harnesses this one is NOT pure: it calls the live vision
 * extractor, costs API quota, and is slow. It is deliberately not part of
 * `npm test`.
 *
 * Run: node tests/ocr/runExtractionAccuracy.js [--limit N] [--json out.json]
 */

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const IMAGES_DIR = path.join(HERE, 'images');
const LABELS = path.join(HERE, 'labels.json');

// Numeric tolerance: a value is correct if it round-trips to the same number.
// "9.1" vs "9.10" is a formatting difference, not an extraction error.
const NUMERIC_TOLERANCE = 0.001;

function die(code, lines) {
  console.error(lines.join('\n'));
  process.exit(code);
}

if (!fs.existsSync(LABELS)) {
  die(2, [
    '',
    'No labels.json found.',
    '',
    `Expected: ${LABELS}`,
    '',
    'This harness measures extraction accuracy against hand-transcribed ground',
    'truth. It cannot run without the photographs and their labels, and it will',
    'not invent a result.',
    '',
    'To build the set:',
    '  1. Read tests/ocr/README.md',
    '  2. Put photographs in tests/ocr/images/   (gitignored — never committed)',
    '  3. Copy labels.example.json to labels.json and transcribe each report',
    '',
  ]);
}

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : Infinity;
const jsonArg = args.indexOf('--json');
const JSON_OUT = jsonArg >= 0 ? args[jsonArg + 1] : null;

const { extractBloodValuesFromImage } = require('../../services/geminiService');
const { canonicalKey, parseNumeric } = require('../../services/anemiaClassifier');

/** Compare an extracted value against ground truth. */
function valuesMatch(expected, got) {
  const e = parseNumeric(expected);
  const g = parseNumeric(got);
  if (e != null && g != null) return Math.abs(e - g) <= NUMERIC_TOLERANCE;
  return String(expected ?? '').trim().toLowerCase() === String(got ?? '').trim().toLowerCase();
}

/** Match an expected parameter to an extracted row by canonical key, then name. */
function findExtracted(extracted, expectedName) {
  const wantKey = canonicalKey(expectedName);
  if (wantKey) {
    const byKey = extracted.find(
      (r) => (canonicalKey(r.parameter) || canonicalKey(r.abbreviation)) === wantKey
    );
    if (byKey) return byKey;
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return extracted.find((r) => norm(r.parameter) === norm(expectedName)) || null;
}

async function main() {
  const labels = JSON.parse(fs.readFileSync(LABELS, 'utf8'));
  const reports = (labels.reports || []).slice(0, LIMIT);

  if (!reports.length) die(2, ['labels.json contains no reports.']);

  console.log('='.repeat(72));
  console.log(`OCR EXTRACTION ACCURACY — ${reports.length} photograph(s)`);
  console.log('='.repeat(72));

  const perParameter = {};   // canonical name → {found, correct, total}
  const perCondition = {};   // condition tag  → {correct, total}
  const failures = [];
  let totalExpected = 0, totalFound = 0, totalCorrect = 0;
  let hallucinated = 0;      // extracted rows with no counterpart in ground truth
  const errored = [];

  for (const [i, report] of reports.entries()) {
    const imagePath = path.join(IMAGES_DIR, report.file);
    process.stdout.write(`\n[${i + 1}/${reports.length}] ${report.file} (${(report.conditions || []).join(', ') || 'untagged'})\n`);

    if (!fs.existsSync(imagePath)) {
      console.log('   SKIP — image not found');
      errored.push({ file: report.file, reason: 'image not found' });
      continue;
    }

    const ext = path.extname(report.file).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png'
      : ext === '.pdf' ? 'application/pdf'
      : 'image/jpeg';

    let extracted;
    try {
      extracted = await extractBloodValuesFromImage(imagePath, mimeType);
      if (!Array.isArray(extracted)) throw new Error('extractor did not return an array');
    } catch (err) {
      console.log(`   ERROR — ${err.message}`);
      errored.push({ file: report.file, reason: err.message });
      continue;
    }

    const matchedRows = new Set();
    let fileCorrect = 0;

    for (const exp of report.expected) {
      totalExpected += 1;
      const key = canonicalKey(exp.parameter) || exp.parameter;
      perParameter[key] = perParameter[key] || { found: 0, correct: 0, total: 0 };
      perParameter[key].total += 1;

      const got = findExtracted(extracted, exp.parameter);
      if (!got) {
        failures.push(`   MISSED  ${report.file}  ${exp.parameter} (expected ${exp.value})`);
        continue;
      }
      matchedRows.add(got);
      totalFound += 1;
      perParameter[key].found += 1;

      if (valuesMatch(exp.value, got.value)) {
        totalCorrect += 1;
        fileCorrect += 1;
        perParameter[key].correct += 1;
      } else {
        failures.push(`   WRONG   ${report.file}  ${exp.parameter}: expected ${exp.value}, got ${got.value}`);
      }
    }

    // Rows the extractor produced that ground truth does not contain. On a
    // blank or unreadable image this is the number that matters — an extractor
    // that invents plausible values is more dangerous than one that returns none.
    const extra = extracted.filter((r) => !matchedRows.has(r));
    hallucinated += extra.length;
    if (extra.length) {
      failures.push(`   EXTRA   ${report.file}  ${extra.length} parameter(s) not on the report: ${extra.slice(0, 5).map((r) => r.parameter).join(', ')}`);
    }

    console.log(`   ${fileCorrect}/${report.expected.length} correct, ${extra.length} not on the report`);

    for (const cond of report.conditions || ['untagged']) {
      perCondition[cond] = perCondition[cond] || { correct: 0, total: 0 };
      perCondition[cond].correct += fileCorrect;
      perCondition[cond].total += report.expected.length;
    }
  }

  const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`);

  console.log('\n' + '='.repeat(72));
  console.log('SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Parameters expected      : ${totalExpected}`);
  console.log(`  Located by the extractor : ${totalFound}  (${pct(totalFound, totalExpected)} recall)`);
  console.log(`  Correct value            : ${totalCorrect}  (${pct(totalCorrect, totalExpected)} overall accuracy)`);
  console.log(`  Value accuracy when found: ${pct(totalCorrect, totalFound)}`);
  console.log(`  Not on the report        : ${hallucinated}   <- fabrication count`);
  if (errored.length) console.log(`  Images skipped/errored   : ${errored.length}`);

  console.log('\nPer parameter:');
  for (const [name, s] of Object.entries(perParameter).sort()) {
    console.log(`  ${name.padEnd(22)} ${String(s.correct).padStart(3)}/${String(s.total).padEnd(3)} ${pct(s.correct, s.total).padStart(7)}   (located ${pct(s.found, s.total)})`);
  }

  console.log('\nPer photograph condition:');
  for (const [cond, s] of Object.entries(perCondition).sort()) {
    console.log(`  ${cond.padEnd(22)} ${String(s.correct).padStart(3)}/${String(s.total).padEnd(3)} ${pct(s.correct, s.total).padStart(7)}`);
  }

  if (failures.length) {
    console.log('\nFailures:');
    console.log(failures.join('\n'));
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({
      generated_from: reports.length,
      totals: { totalExpected, totalFound, totalCorrect, hallucinated },
      per_parameter: perParameter,
      per_condition: perCondition,
      errored,
    }, null, 2));
    console.log(`\nWrote ${JSON_OUT}`);
  }

  console.log('\n' + '='.repeat(72));
  if (reports.length < 100) {
    console.log(`NOTE: ${reports.length} photographs. The review asks for 100 covering glare,`);
    console.log('skew, curl and multi-column layouts. Treat this as indicative only.');
  }
  console.log('='.repeat(72));

  // No pass/fail threshold: this harness reports a number nobody has measured
  // yet. A threshold invented before the first measurement would be arbitrary.
  process.exit(0);
}

main().catch((err) => {
  console.error('\nHarness failed:', err.message);
  process.exit(1);
});
