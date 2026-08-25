/**
 * curatedInteractions.js — a small, high-severity, pharmacist-review-pending set.
 *
 * Phase 2 faculty review (Dr. Leibovitz, Aug 2026):
 *
 *   "openFDA supplies unstructured label text rather than a curated interaction
 *    graph, and RxNorm provides normalization rather than severity. State that
 *    limitation in the interface and scope alerts to a small, curated,
 *    high-severity set rather than attempting comprehensive screening over
 *    label text."
 *
 *   "Add a pharmacist-reviewed suppression layer to interaction alerts so that a
 *    label-derived warning does not prompt a patient to stop a needed drug."
 *
 * Two design rules follow, and both are load-bearing:
 *
 * 1. SMALL AND CURATED, NOT COMPREHENSIVE. Comprehensive screening over label
 *    prose produces a wall of warnings a patient cannot triage, which is worse
 *    than no warning: it trains people to dismiss all of them. This list covers
 *    class-level mechanisms that are documented in every major reference — it is
 *    not an attempt at completeness, and it says so.
 *
 * 2. NO ALERT EVER TELLS A PATIENT TO STOP A DRUG. Every entry's patient_action
 *    routes to a clinician or pharmacist. The failure mode the review names — a
 *    warning that prompts someone to stop a needed medicine — is worse than the
 *    interaction it warns about. This is enforced by a test, not by convention.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NOT YET PHARMACIST-REVIEWED.                                             │
 * │ `PHARMACIST_REVIEWED` is false and every entry carries reviewed: false.  │
 * │ isCuratedAlertingEnabled() returns false while that is the case, so this │
 * │ list informs the interface's disclosure but must not drive a patient-    │
 * │ facing alert. A licensed pharmacist signs off before that flag flips.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sources are class-level mechanisms from standard references (FDA labelling,
 * AGA 2020 IDA guideline for the iron-absorption entries). Each entry names the
 * mechanism so a reviewer can check it rather than take it on trust.
 */

/** Flips to true only when a licensed pharmacist has signed off on every entry. */
const PHARMACIST_REVIEWED = false;

/**
 * Severity vocabulary — deliberately only two levels.
 *   'high'     — clinically significant; warrants a conversation before the next dose
 *   'moderate' — worth raising at the next appointment
 * Anything below that is noise for a patient-facing product and is not listed.
 */
const CURATED_INTERACTIONS = [
  // ── Iron absorption: directly relevant to this product's anemia focus ──────
  {
    id: 'iron-ppi',
    drugs: ['oral iron', 'proton pump inhibitor'],
    matches: [['ferrous', 'iron'], ['omeprazole', 'esomeprazole', 'pantoprazole', 'lansoprazole', 'rabeprazole']],
    severity: 'moderate',
    mechanism: 'Acid suppression reduces absorption of oral iron salts, which need an acidic stomach to dissolve.',
    patient_action: 'Both are commonly taken together on purpose. Ask your doctor or pharmacist about timing, or whether a different iron form suits you better.',
    source: 'AGA 2020 IDA Clinical Practice Guideline; FDA labelling for oral iron salts',
    reviewed: false,
  },
  {
    id: 'iron-levothyroxine',
    drugs: ['oral iron', 'levothyroxine'],
    matches: [['ferrous', 'iron'], ['levothyroxine', 'synthroid', 'euthyrox']],
    severity: 'moderate',
    mechanism: 'Iron binds levothyroxine in the gut and reduces how much thyroid hormone is absorbed.',
    patient_action: 'Usually managed by separating the doses by several hours. Ask your pharmacist how to space them — do not change either dose yourself.',
    source: 'FDA labelling for levothyroxine (drug interactions: iron salts)',
    reviewed: false,
  },
  {
    id: 'iron-tetracycline',
    drugs: ['oral iron', 'tetracycline-class antibiotic'],
    matches: [['ferrous', 'iron'], ['doxycycline', 'tetracycline', 'minocycline']],
    severity: 'moderate',
    mechanism: 'Iron and tetracyclines bind each other in the gut, reducing absorption of both.',
    patient_action: 'Ask your pharmacist about spacing the doses while you are on the antibiotic course.',
    source: 'FDA labelling for tetracycline-class antibiotics',
    reviewed: false,
  },

  // ── Bleeding risk: relevant because our product flags anemia ───────────────
  {
    id: 'warfarin-nsaid',
    drugs: ['warfarin', 'NSAID'],
    matches: [['warfarin', 'coumadin'], ['ibuprofen', 'naproxen', 'diclofenac', 'ketorolac', 'aspirin']],
    severity: 'high',
    mechanism: 'Additive bleeding risk: NSAIDs impair platelet function and irritate the stomach lining while warfarin reduces clotting.',
    patient_action: 'Speak to your doctor or pharmacist before your next dose. Do not stop your warfarin — stopping it carries its own serious risks.',
    source: 'FDA labelling for warfarin (drug interactions: NSAIDs)',
    reviewed: false,
  },
  {
    id: 'anticoagulant-antiplatelet',
    drugs: ['oral anticoagulant', 'antiplatelet'],
    matches: [['warfarin', 'apixaban', 'rivaroxaban', 'edoxaban', 'dabigatran'], ['clopidogrel', 'prasugrel', 'ticagrelor']],
    severity: 'high',
    mechanism: 'Combined anticoagulant and antiplatelet therapy substantially increases bleeding risk.',
    patient_action: 'This combination is sometimes prescribed deliberately. Confirm with your doctor that both are still intended — do not stop either one on your own.',
    source: 'FDA labelling for oral anticoagulants and P2Y12 inhibitors',
    reviewed: false,
  },

  // ── Renal / electrolyte: relevant to the kidney panel we display ───────────
  {
    id: 'acei-arb-potassium',
    drugs: ['ACE inhibitor or ARB', 'potassium-sparing diuretic or potassium supplement'],
    matches: [['lisinopril', 'ramipril', 'enalapril', 'losartan', 'valsartan', 'irbesartan'], ['spironolactone', 'eplerenone', 'amiloride', 'triamterene', 'potassium chloride']],
    severity: 'high',
    mechanism: 'Both raise serum potassium; together they can cause dangerous hyperkalemia, particularly with reduced kidney function.',
    patient_action: 'Ask your doctor how often your potassium and kidney function are being checked. Keep taking both unless your doctor tells you otherwise.',
    source: 'FDA labelling for ACE inhibitors, ARBs and potassium-sparing diuretics',
    reviewed: false,
  },
  {
    id: 'metformin-contrast',
    drugs: ['metformin', 'iodinated contrast'],
    matches: [['metformin', 'glucophage'], ['iodinated contrast', 'contrast dye']],
    severity: 'high',
    mechanism: 'Contrast-induced kidney injury can cause metformin to accumulate, raising the risk of lactic acidosis.',
    patient_action: 'Tell the imaging team you take metformin before any scan using contrast. They will advise on timing.',
    source: 'FDA labelling for metformin (boxed warning: lactic acidosis)',
    reviewed: false,
  },

  // ── Hepatic: relevant to the liver panel we display ───────────────────────
  {
    id: 'statin-fibrate',
    drugs: ['statin', 'fibrate'],
    matches: [['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'], ['gemfibrozil', 'fenofibrate']],
    severity: 'high',
    mechanism: 'Combined use raises the risk of muscle injury (myopathy and rhabdomyolysis), which can damage the kidneys.',
    patient_action: 'Report unexplained muscle pain, tenderness or dark urine to your doctor promptly. Do not stop either medicine on your own.',
    source: 'FDA labelling for statins (drug interactions: fibrates)',
    reviewed: false,
  },
];

const DISCLOSURE =
  'We check a short, curated list of well-documented, high-severity interactions — ' +
  'not every possible interaction. The public drug databases we use (RxNorm, openFDA) ' +
  'supply drug names and label text, not graded severity, so they cannot tell us which ' +
  'warnings matter. Your pharmacist can check your full medication list properly.';

const NEVER_STOP_NOTICE =
  'Never stop a prescribed medicine because of a warning shown here. Stopping a ' +
  'needed medicine can be more dangerous than the interaction. Speak to your ' +
  'doctor or pharmacist first.';

/** Normalize a drug name for matching. */
function norm(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** True when any alias appears in the normalized drug name. */
function hits(drugName, aliases) {
  const n = norm(drugName);
  return aliases.some((a) => n.includes(norm(a)));
}

/**
 * Match a patient's medication list against the curated set.
 * Returns [] when nothing matches — an empty result means "nothing on our short
 * list", never "no interactions", and the disclosure must say so.
 *
 * @param {string[]} drugNames
 * @returns {Array} matched entries, with the two matching drug names attached
 */
function findCuratedInteractions(drugNames) {
  if (!Array.isArray(drugNames) || drugNames.length < 2) return [];
  const found = [];
  for (const entry of CURATED_INTERACTIONS) {
    const [aliasesA, aliasesB] = entry.matches;
    const a = drugNames.find((d) => hits(d, aliasesA));
    const b = drugNames.find((d) => hits(d, aliasesB));
    if (a && b && a !== b) {
      found.push({
        id: entry.id,
        severity: entry.severity,
        drugs: [a, b],
        classes: entry.drugs,
        mechanism: entry.mechanism,
        patient_action: entry.patient_action,
        source: entry.source,
        pharmacist_reviewed: entry.reviewed,
      });
    }
  }
  // High severity first; stable within a level.
  return found.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'high' ? -1 : 1));
}

/**
 * Whether curated matches may drive a patient-facing alert.
 * False until a licensed pharmacist has reviewed every entry — the review asks
 * for a pharmacist-reviewed suppression layer, and an unreviewed list is not one.
 */
function isCuratedAlertingEnabled() {
  return PHARMACIST_REVIEWED && CURATED_INTERACTIONS.every((e) => e.reviewed);
}

module.exports = {
  CURATED_INTERACTIONS,
  PHARMACIST_REVIEWED,
  DISCLOSURE,
  NEVER_STOP_NOTICE,
  findCuratedInteractions,
  isCuratedAlertingEnabled,
};
