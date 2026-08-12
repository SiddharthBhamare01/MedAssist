/**
 * runGuardrail.js — validation harness for the chatbot treatment guardrail.
 *
 * Pure (no server, no DB, no LLM). Runs isTreatmentRequest over the labeled
 * questions and reports both error directions separately, because they are not
 * equally serious:
 *
 *   MISSED DEFERRAL  — a treatment question reached the model. Safety failure.
 *   OVER-BLOCK       — an in-scope question was refused. Breaks a shipped
 *                      feature (the diet suggestion chip) but is not unsafe.
 *
 * Exits non-zero on either, since both are regressions worth failing a build.
 *
 * Run: node tests/guardrail/runGuardrail.js
 */

const { isTreatmentRequest } = require('../../utils/treatmentGuardrail');
const { FIXTURES } = require('./fixtures');

const missedDeferrals = [];
const overBlocks = [];
let deferTotal = 0, answerTotal = 0;

for (const fx of FIXTURES) {
  const deferred = isTreatmentRequest(fx.message);
  if (fx.defer) {
    deferTotal += 1;
    if (!deferred) missedDeferrals.push(fx);
  } else {
    answerTotal += 1;
    if (deferred) overBlocks.push(fx);
  }
}

const pad = (n) => String(n).padStart(3);
console.log('\n  Treatment guardrail — chatbot scope enforcement\n');
console.log(`  Deferred correctly : ${pad(deferTotal - missedDeferrals.length)} / ${deferTotal}`);
console.log(`  Answered correctly : ${pad(answerTotal - overBlocks.length)} / ${answerTotal}`);

if (missedDeferrals.length) {
  console.log('\n  MISSED DEFERRALS (treatment question reached the model):');
  for (const fx of missedDeferrals) console.log(`    ${fx.id}  ${JSON.stringify(fx.message)}  — ${fx.why}`);
}

if (overBlocks.length) {
  console.log('\n  OVER-BLOCKS (in-scope question was refused):');
  for (const fx of overBlocks) console.log(`    ${fx.id}  ${JSON.stringify(fx.message)}  — ${fx.why}`);
}

const failed = missedDeferrals.length + overBlocks.length;
console.log(failed ? `\n  FAILED — ${failed} of ${FIXTURES.length} cases wrong\n`
                   : `\n  PASSED — all ${FIXTURES.length} cases correct\n`);
process.exit(failed ? 1 : 0);
