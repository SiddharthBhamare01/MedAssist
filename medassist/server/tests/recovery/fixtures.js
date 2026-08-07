/**
 * fixtures.js — labeled synthetic recovery journeys for the forecast engine.
 *
 * Each case is a serial hemoglobin history for one patient:
 *   { id, description, days: [[dayOffset, hb], ...], type, cutoff, mixedBasis, expected }
 *
 * `expected` keys are all optional — the harness skips any that are absent.
 * Recognized: responder_status, trend, has_forecast, defer_to_physician.
 *
 * The weight of this set is deliberately on REFUSAL, not on arithmetic. Whether
 * "2.8 weeks to target" is computed correctly is trivially true (it is one
 * division by a constant); what matters is whether the engine declines to make
 * that claim when it has no business making it — on a falling hemoglobin, on a
 * moved cutoff, on a non-iron anemia, on a relapse, on a single reading.
 *
 * Coverage: 24 journeys — responders, non-responders (incl. boundary), too-early,
 * interval-too-long, recovered, relapse-after-recovery, never-anemic, non-iron
 * types, mixed cutoff basis, pregnancy/pediatric cutoffs, and declining series.
 */

// Fixed epoch so runs are reproducible (2026-01-01T00:00:00Z). No Date.now here.
const BASE_TS = 1767225600000;
const DAY_MS = 86400000;

/** Build a point series from [dayOffset, hb] pairs. */
const j = (...pairs) => pairs.map(([d, hb]) => ({ ts: BASE_TS + d * DAY_MS, hb }));

const FIXTURES = [
  // ── Responders (iron deficiency, inside the 14–90 day window) ──────────────
  {
    id: 'R-classic',
    description: 'Iron deficiency, +1.3 g/dL at day 14 → responding, forecast offered',
    days: j([0, 8.2], [14, 9.5]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'RESPONDING', trend: 'improving', has_forecast: true, defer_to_physician: false },
  },
  {
    id: 'R-boundary',
    description: 'Exactly +1.0 g/dL at day 14 → responder (threshold is inclusive)',
    days: j([0, 8.0], [14, 9.0]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'RESPONDING', trend: 'improving', has_forecast: true },
  },
  {
    id: 'R-strong',
    description: 'Steady rise over 30 days, still below cutoff → responding',
    days: j([0, 7.0], [14, 8.4], [30, 9.5]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'RESPONDING', trend: 'improving', has_forecast: true },
  },
  {
    id: 'R-pregnant',
    description: 'Pregnancy cutoff 11.0, +1.4 at day 21 → responding',
    days: j([0, 8.4], [21, 9.8]),
    type: 'iron_deficiency', cutoff: 11,
    expected: { responder_status: 'RESPONDING', trend: 'improving', has_forecast: true },
  },
  {
    id: 'R-child',
    description: 'Child cutoff 11.5, +2.0 at day 28 → responding',
    days: j([0, 8.5], [28, 10.5]),
    type: 'iron_deficiency', cutoff: 11.5,
    expected: { responder_status: 'RESPONDING', trend: 'improving', has_forecast: true },
  },

  // ── Non-responders — the safety-critical class ────────────────────────────
  {
    id: 'NR-flat',
    description: 'Only +0.3 g/dL at day 14 → NOT responding, defer, no forecast',
    days: j([0, 8.2], [14, 8.5]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'NOT_RESPONDING', trend: 'stable', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'NR-near-miss',
    description: '+0.9 g/dL at day 21 — just under the threshold → NOT responding',
    days: j([0, 8.0], [21, 8.9]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'NOT_RESPONDING', trend: 'improving', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'NR-zero',
    description: 'No movement at all over 28 days → NOT responding',
    days: j([0, 9.1], [28, 9.1]),
    type: 'iron_deficiency', cutoff: 13,
    expected: { responder_status: 'NOT_RESPONDING', trend: 'stable', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'NR-declining',
    description: 'Hemoglobin FALLS over 21 days → NOT responding, worsening, never a forecast',
    days: j([0, 10.0], [21, 8.0]),
    type: 'iron_deficiency', cutoff: 13,
    expected: { responder_status: 'NOT_RESPONDING', trend: 'worsening', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'NR-declining-slow',
    description: 'Slow decline over 60 days → NOT responding, worsening',
    days: j([0, 9.5], [30, 9.0], [60, 8.4]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'NOT_RESPONDING', trend: 'worsening', has_forecast: false, defer_to_physician: true },
  },

  // ── Too early — before the day-14 checkpoint ──────────────────────────────
  {
    id: 'TE-rising',
    description: 'Day 5, small rise → too early to judge, but a forecast is allowed',
    days: j([0, 8.2], [5, 8.6]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'TOO_EARLY', trend: 'stable', has_forecast: true, defer_to_physician: false },
  },
  {
    id: 'TE-falling',
    description: 'Day 5 but hemoglobin DROPPED — too early to judge response, yet a forecast here would be the dangerous claim',
    days: j([0, 9.0], [5, 8.0]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'TOO_EARLY', trend: 'worsening', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'TE-day13',
    description: 'Day 13 — one day short of the checkpoint → still too early',
    days: j([0, 8.0], [13, 9.4]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'TOO_EARLY', trend: 'improving', has_forecast: true },
  },

  // ── Interval outside the window where the day-14 bar means anything ───────
  {
    id: 'IL-flat-120d',
    description: '120 days with almost no rise — too long for the 2-week bar, report trend only',
    days: j([0, 8.2], [120, 8.6]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'INTERVAL_TOO_LONG', trend: 'stable', has_forecast: false },
  },
  {
    id: 'IL-day91',
    description: 'Day 91 — one day past the window boundary',
    days: j([0, 8.0], [91, 10.5]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'INTERVAL_TOO_LONG', trend: 'improving', has_forecast: false },
  },
  {
    id: 'IL-day90-ok',
    description: 'Day 90 — exactly on the boundary, still assessable',
    days: j([0, 8.0], [90, 10.5]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'RESPONDING', trend: 'improving', has_forecast: true },
  },

  // ── Recovered / never anemic ──────────────────────────────────────────────
  {
    id: 'REC-normalized',
    description: 'Reached the cutoff → recovered, no forecast needed',
    days: j([0, 8.2], [30, 12.4]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'RECOVERED', trend: 'improving', has_forecast: false, defer_to_physician: false },
  },
  {
    id: 'REC-exact',
    description: 'Latest sits exactly on the cutoff → recovered (cutoff is inclusive)',
    days: j([0, 9.0], [28, 12.0]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'RECOVERED', has_forecast: false },
  },
  {
    id: 'NA-never-anemic',
    description: 'Every reading above the cutoff → nothing to track',
    days: j([0, 13.5], [30, 14.1]),
    type: null, cutoff: 12,
    expected: { responder_status: 'NOT_APPLICABLE', has_forecast: false },
  },

  // ── Relapse — the case a naive earliest-anemic baseline gets wrong ────────
  {
    id: 'REL-after-recovery',
    description: 'Recovered then dropped hard 6 days later. A baseline from the OLD episode would read this 4.8 g/dL fall as a +2.0 rise and forecast recovery. Modeled on real dev data.',
    days: j([0, 8.2], [20, 15.0], [26, 10.2]),
    type: 'iron_deficiency', cutoff: 13,
    expected: { responder_status: 'INSUFFICIENT_DATA', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'REL-with-followup',
    description: 'Relapse with a follow-up inside the new episode → judged on the NEW baseline only',
    days: j([0, 8.0], [20, 13.5], [30, 10.0], [46, 10.2]),
    type: 'iron_deficiency', cutoff: 13,
    expected: { responder_status: 'NOT_RESPONDING', trend: 'stable', has_forecast: false, defer_to_physician: true },
  },

  // ── Non-iron types — the response curve does not apply ────────────────────
  {
    id: 'B12-rising',
    description: 'Macrocytic B12/folate pattern rising → no iron forecast, defer',
    days: j([0, 8.2], [14, 9.6]),
    type: 'b12_folate_deficiency', cutoff: 13,
    expected: { responder_status: 'NOT_APPLICABLE', trend: 'improving', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'B12-day5',
    description: 'Non-iron at day 5 — the type gate must fire before the interval gate, so this must NOT read TOO_EARLY',
    days: j([0, 8.2], [5, 8.4]),
    type: 'b12_folate_deficiency', cutoff: 13,
    expected: { responder_status: 'NOT_APPLICABLE', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'ACD-normocytic',
    description: 'Anemia of chronic disease → no forecast',
    days: j([0, 9.5], [30, 10.1]),
    type: 'anemia_of_chronic_disease', cutoff: 13,
    expected: { responder_status: 'NOT_APPLICABLE', has_forecast: false, defer_to_physician: true },
  },
  {
    id: 'UNSPEC-no-mcv',
    description: 'Type unclassifiable (no MCV) → no forecast',
    days: j([0, 8.8], [21, 10.2]),
    type: 'unspecified', cutoff: 12,
    expected: { responder_status: 'NOT_APPLICABLE', has_forecast: false, defer_to_physician: true },
  },

  // ── Moved cutoff — "weeks to target" aims at a target that shifted ────────
  {
    id: 'MB-responding',
    description: 'Responding, but the cutoff changed across the series → no forecast',
    days: j([0, 8.2], [14, 9.5]),
    type: 'iron_deficiency', cutoff: 11, mixedBasis: true,
    expected: { responder_status: 'RESPONDING', trend: 'improving', has_forecast: false },
  },

  // ── Insufficient data ─────────────────────────────────────────────────────
  {
    id: 'ID-single',
    description: 'One reading only → nothing to assess',
    days: j([0, 8.2]),
    type: 'iron_deficiency', cutoff: 12,
    expected: { responder_status: 'INSUFFICIENT_DATA', has_forecast: false },
  },
  {
    id: 'ID-no-cutoff',
    description: 'Two readings but no known cutoff → nothing to assess',
    days: j([0, 8.2], [14, 9.5]),
    type: 'iron_deficiency', cutoff: null,
    expected: { responder_status: 'INSUFFICIENT_DATA', has_forecast: false },
  },
];

module.exports = { FIXTURES, BASE_TS, DAY_MS };
