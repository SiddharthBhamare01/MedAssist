/**
 * runCurated.js — validation harness for the curated interaction set.
 *
 * Pure (no server, no DB, no network). Enforces the two rules from the Phase 2
 * review that must not decay as entries are added:
 *
 *   1. No alert ever tells a patient to stop a prescribed medicine.
 *   2. Curated alerting stays disabled until a pharmacist has reviewed the set.
 *
 * Rule 1 is the one that matters clinically: "a label-derived warning [must not]
 * prompt a patient to stop a needed drug." A convention holds for one commit; a
 * failing test holds indefinitely.
 *
 * Run: node tests/interactions/runCurated.js
 */

const {
  CURATED_INTERACTIONS,
  findCuratedInteractions,
  isCuratedAlertingEnabled,
  DISCLOSURE,
  NEVER_STOP_NOTICE,
} = require('../../data/curatedInteractions');

let pass = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) { pass += 1; console.log(`  PASS  ${label}`); }
  else { failures.push(`  ${label}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

console.log('='.repeat(64));
console.log(`CURATED INTERACTION SET — ${CURATED_INTERACTIONS.length} entries`);
console.log('='.repeat(64) + '\n');

// ── Rule 1: never tell a patient to stop a drug ──────────────────────────────
const STOP_ADVICE = /\b(stop|discontinue|cease|quit|halt)\b[^.]{0,40}\b(taking|using|your|the|this|medic|drug|dose|tablet|pill)\b/i;
const stopOffenders = CURATED_INTERACTIONS.filter((e) => {
  // "do not stop" / "never stop" is the correct phrasing, not an offence.
  const withoutNegated = e.patient_action.replace(/\b(do not|don'?t|never)\s+stop\b/gi, '');
  return STOP_ADVICE.test(withoutNegated);
});
check('no entry advises stopping a medicine', stopOffenders.length === 0,
  stopOffenders.map((e) => e.id).join(', '));

const noRoute = CURATED_INTERACTIONS.filter(
  (e) => !/doctor|pharmacist|imaging team|clinician/i.test(e.patient_action)
);
check('every entry routes to a clinician', noRoute.length === 0, noRoute.map((e) => e.id).join(', '));

// ── Rule 2: disabled until reviewed ──────────────────────────────────────────
check('curated alerting is disabled while unreviewed',
  isCuratedAlertingEnabled() === false || CURATED_INTERACTIONS.every((e) => e.reviewed),
  'alerting is enabled but not every entry is marked reviewed');

// ── Entry hygiene ────────────────────────────────────────────────────────────
const requiredFields = ['id', 'drugs', 'matches', 'severity', 'mechanism', 'patient_action', 'source'];
const incomplete = CURATED_INTERACTIONS.filter((e) => requiredFields.some((f) => !e[f]));
check('every entry has all required fields', incomplete.length === 0,
  incomplete.map((e) => e.id || '(no id)').join(', '));

const badSeverity = CURATED_INTERACTIONS.filter((e) => !['high', 'moderate'].includes(e.severity));
check('severity is only high or moderate', badSeverity.length === 0,
  badSeverity.map((e) => `${e.id}=${e.severity}`).join(', '));

const ids = CURATED_INTERACTIONS.map((e) => e.id);
check('ids are unique', new Set(ids).size === ids.length);

check('the set stays small (comprehensive screening is the failure mode)',
  CURATED_INTERACTIONS.length <= 25, `${CURATED_INTERACTIONS.length} entries`);

// ── Matching ─────────────────────────────────────────────────────────────────
let m = findCuratedInteractions(['Warfarin 5mg', 'Ibuprofen 400mg']);
check('warfarin + NSAID matches as high', m.length === 1 && m[0].severity === 'high');

m = findCuratedInteractions(['Ferrous Sulfate 325mg', 'Omeprazole 20mg', 'Levothyroxine 50mcg']);
check('iron matches both PPI and levothyroxine', m.length === 2, `got ${m.length}`);

m = findCuratedInteractions(['Warfarin', 'Clopidogrel', 'Ibuprofen']);
check('high severity sorts first', m.length >= 2 && m[0].severity === 'high');

check('single drug → no alerts', findCuratedInteractions(['Warfarin']).length === 0);
check('unrelated drugs → no alerts', findCuratedInteractions(['Cetirizine', 'Paracetamol']).length === 0);
check('brand name matches (Coumadin)', findCuratedInteractions(['Coumadin', 'Naproxen']).length === 1);

// ── Disclosure text ──────────────────────────────────────────────────────────
check('disclosure states the set is not comprehensive', /not every possible interaction/i.test(DISCLOSURE));
check('disclosure states the databases lack graded severity', /not graded severity/i.test(DISCLOSURE));
check('never-stop notice exists and is explicit', /never stop/i.test(NEVER_STOP_NOTICE));

console.log('\n' + '='.repeat(64));
const total = pass + failures.length;
console.log(`Checks passed: ${pass}/${total}`);
if (failures.length) {
  console.log('\nFailures:\n' + failures.join('\n'));
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('RESULT: PASS');
console.log('\nNote: curated alerting is DISABLED until a licensed pharmacist reviews');
console.log('every entry. The set informs the interface disclosure; it must not yet');
console.log('drive a patient-facing alert.');
process.exit(0);
