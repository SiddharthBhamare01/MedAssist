/**
 * recoveryForecast.js — deterministic, source-cited recovery-trajectory engine.
 *
 * "The AI only explains the result, never decides it." Every value here is
 * computed by rule from serial hemoglobin values + published response curves —
 * no LLM involved. Pure functions only (no DB, no network) so the validation
 * harness can call them directly.
 *
 * This engine is deliberately reluctant. It refuses to project a recovery far
 * more often than it offers one, because the dangerous failure here is the
 * mirror of a false negative in the classifier: telling someone whose
 * hemoglobin is falling that they are on track.
 *
 * Clinical sources:
 *   - Iron-replacement response ≈1 g/dL per week; responder ≥1 g/dL by day 14
 *     (Am J Medicine 5-trial analysis; Medscape iron-deficiency anemia treatment)
 *   - Anemia cutoff / target: WHO 2024 haemoglobin cutoffs to define anaemia
 *   - Non-response workup (GI blood loss / malabsorption): AGA 2020 IDA guideline
 */

const SOURCES = {
  response: { claim: 'expected hemoglobin response to iron', source: 'Am J Medicine 5-trial analysis — ≈1 g/dL per week; responder ≥1 g/dL at day 14' },
  target:   { claim: 'recovery target', source: 'WHO 2024 Guideline on haemoglobin cutoffs to define anaemia' },
  workup:   { claim: 'non-response workup', source: 'AGA 2020 IDA Clinical Practice Guideline (evaluate for GI blood loss / malabsorption)' },
};

/** Documented iron-replacement response rate, g/dL per week. */
const WEEKLY_RISE = 1.0;
/** A responder shows at least this much rise by the day-14 checkpoint. */
const RESPONDER_MIN_RISE = 1.0;
/** Earliest interval at which the responder threshold means anything. */
const ASSESS_MIN_DAYS = 14;
/**
 * Latest interval at which it still means anything. Past ~3 months the 1 g/dL
 * bar tests nothing: a true responder would have normalized long ago, and a
 * partial responder who plateaued fails it identically. Outside the window we
 * report the trend and say so, rather than asserting non-response.
 */
const ASSESS_MAX_DAYS = 90;
/**
 * Hemoglobin moves ±0.3 g/dL on analytic and biological variability alone, so
 * anything inside this band is called "stable" rather than given a direction.
 */
const STABLE_BAND = 0.5;

const DAY_MS = 86400000;

/** Whole days between two epoch-ms timestamps. */
const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);

/** Round to one decimal — hemoglobin is never reported more precisely than this. */
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Index of the first point belonging to the CURRENT anemic episode.
 *
 * Anchoring to the earliest anemic reading on file is wrong: a patient whose
 * hemoglobin recovered and then relapsed would be measured against a baseline
 * from before the recovery, so a steep recent DROP can read as a long-run RISE.
 * The episode therefore starts after the most recent at-or-above-cutoff reading.
 */
function episodeStartIndex(points, cutoff) {
  let lastNormal = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].hb >= cutoff) lastNormal = i;
  }
  return lastNormal + 1;
}

/** 'improving' | 'stable' | 'worsening' from a signed change in g/dL. */
function trendFromRise(rise) {
  if (rise >= STABLE_BAND) return 'improving';
  if (rise <= -STABLE_BAND) return 'worsening';
  return 'stable';
}

/**
 * Deterministic recovery assessment across serial hemoglobin readings.
 *
 * @param {Array<{ts:number, hb:number}>} points  ascending by ts (epoch ms)
 * @param {Object} opts
 * @param {string|null} opts.type        anemia type of the latest report ('iron_deficiency', ...)
 * @param {number|null} opts.cutoff      the patient's WHO anemia cutoff, g/dL
 * @param {boolean} opts.mixedBasis      true when the cutoff moved across the series
 * @returns {Object} the analysis-shaped recovery determination
 */
function forecastRecovery(points, { type = null, cutoff = null, mixedBasis = false } = {}) {
  const series = Array.isArray(points) ? points.filter((p) => p && typeof p.hb === 'number' && typeof p.ts === 'number') : [];

  const base = {
    applicable: false,
    responder_status: 'INSUFFICIENT_DATA',
    trend: null,
    baseline: null,
    latest: null,
    observed_rise: null,
    days_elapsed: null,
    forecast: null,
    defer_to_physician: false,
    deferral_reason: null,
    recommendation: null,
    explanation_seed: '',
    sources: [SOURCES.target],
    computed_at: null, // stamped by the caller (pure fn — no Date.now here)
  };

  // 1. Not enough to describe a trajectory at all.
  if (series.length < 2 || cutoff == null) {
    return {
      ...base,
      explanation_seed: 'At least two hemoglobin readings and a known anemia cutoff are needed before a recovery trajectory can be assessed.',
      recommendation: 'Upload a follow-up CBC to start tracking your recovery.',
    };
  }

  const latest = series[series.length - 1];

  // 2. Currently at or above the target — nothing to project toward.
  if (latest.hb >= cutoff) {
    const wasAnemic = series.some((p) => p.hb < cutoff);
    if (!wasAnemic) {
      return {
        ...base,
        responder_status: 'NOT_APPLICABLE',
        trend: trendFromRise(latest.hb - series[0].hb),
        latest,
        explanation_seed: `Every hemoglobin reading on file is at or above the ${cutoff} g/dL cutoff, so there is no anemia recovery to track.`,
      };
    }
    return {
      ...base,
      applicable: true,
      responder_status: 'RECOVERED',
      trend: 'improving',
      latest,
      sources: [SOURCES.target, SOURCES.response],
      recommendation: 'Hemoglobin is back at or above your target. Discuss with your physician how long to continue treatment, since iron stores refill more slowly than hemoglobin.',
      explanation_seed: `The most recent hemoglobin (${latest.hb} g/dL) is at or above the ${cutoff} g/dL cutoff, so this anemia episode has resolved.`,
    };
  }

  // 3. Anchor to the CURRENT episode, not to the oldest anemic reading on file.
  const start = episodeStartIndex(series, cutoff);
  const baseline = series[start];

  // Only one reading since hemoglobin fell below the cutoff → no interval to judge.
  if (start >= series.length - 1) {
    // A RELAPSE is not missing data — the patient has plenty of history, it simply
    // belongs to a resolved episode. Reporting it as INSUFFICIENT_DATA reads as
    // "the app is missing information" when the real finding is "hemoglobin has
    // dropped below the cutoff again", so it gets its own status.
    if (start > 0) {
      return {
        ...base,
        responder_status: 'NEW_EPISODE',
        latest,
        baseline,
        trend: null,
        defer_to_physician: true,
        deferral_reason: 'Hemoglobin has dropped back below the anemia cutoff after a previous normal reading — physician review is recommended.',
        recommendation: 'Upload a follow-up CBC once you and your physician have decided on next steps, so this new episode can be tracked.',
        explanation_seed: `Hemoglobin has fallen below the ${cutoff} g/dL cutoff again after a previous normal reading. This is the first reading of a new episode, so earlier readings are not used to judge recovery.`,
      };
    }
    return {
      ...base,
      latest,
      baseline,
      trend: null,
      explanation_seed: `Only one hemoglobin reading is below the ${cutoff} g/dL cutoff, so there is no interval over which to assess recovery yet.`,
      recommendation: 'Upload a follow-up CBC to see whether your hemoglobin is rising.',
    };
  }

  const observedRise = r1(latest.hb - baseline.hb);
  const days = daysBetween(baseline.ts, latest.ts);
  const trend = trendFromRise(observedRise);

  const result = {
    ...base,
    applicable: true,
    trend,
    baseline,
    latest,
    observed_rise: observedRise,
    days_elapsed: days,
    sources: [SOURCES.target, SOURCES.response],
  };

  // 4. Type gate BEFORE the interval gate. The ≈1 g/dL/week curve is the response
  //    to iron replacement; applying it to a B12/folate or chronic-disease anemia
  //    would be a claim we cannot source. (Gating on the interval first would also
  //    make a non-iron patient appear to change state as days pass.)
  if (type !== 'iron_deficiency') {
    return {
      ...result,
      responder_status: 'NOT_APPLICABLE',
      defer_to_physician: true,
      deferral_reason: 'The expected-recovery curve is documented for iron replacement. This anemia is not an iron-deficiency pattern, so no time-to-normal is estimated.',
      recommendation: 'Discuss the expected course of this type of anemia with your physician.',
      explanation_seed: `Hemoglobin moved from ${baseline.hb} to ${latest.hb} g/dL over ${days} days (${trend}). Because this is not an iron-deficiency pattern, no recovery time is estimated.`,
    };
  }

  // 5. Responder classification — only inside the window where the day-14
  //    threshold is clinically meaningful.
  if (days < ASSESS_MIN_DAYS) {
    result.responder_status = 'TOO_EARLY';
    result.explanation_seed = `Hemoglobin moved from ${baseline.hb} to ${latest.hb} g/dL over ${days} days. Response to iron is normally judged at about two weeks, so it is too early to tell.`;
  } else if (days > ASSESS_MAX_DAYS) {
    result.responder_status = 'INTERVAL_TOO_LONG';
    result.explanation_seed = `Hemoglobin moved from ${baseline.hb} to ${latest.hb} g/dL over ${days} days (${trend}). That gap is too long for the two-week response check, so only the trend is reported.`;
    result.recommendation = 'Ask your physician whether a more recent CBC would help judge how treatment is working.';
  } else if (observedRise >= RESPONDER_MIN_RISE) {
    result.responder_status = 'RESPONDING';
    result.explanation_seed = `Hemoglobin rose ${observedRise} g/dL over ${days} days, which matches or exceeds the ≈1 g/dL expected by the two-week checkpoint.`;
  } else {
    // The app cannot observe whether iron therapy was ever started, so this is
    // worded conditionally — it reports a smaller-than-expected rise, it does not
    // assert a failed treatment response.
    result.responder_status = 'NOT_RESPONDING';
    result.sources.push(SOURCES.workup);
    result.defer_to_physician = true;
    result.deferral_reason = `Hemoglobin rose only ${observedRise} g/dL over ${days} days. If iron treatment has been taken since the first reading, that is less than the ≈1 g/dL typically seen by two weeks.`;
    // Deliberately does NOT repeat the "if you have been taking iron" conditional
    // from deferral_reason — the banner states the finding, this states the action.
    result.recommendation = 'Discuss this with your physician — a smaller-than-expected rise can point to absorption problems or ongoing blood loss, which may warrant further evaluation.';
    result.explanation_seed = `Hemoglobin rose ${observedRise} g/dL over ${days} days, less than the ≈1 g/dL expected by two weeks if iron is being taken; physician review is recommended.`;
  }

  // 6. Forecast — offered only when every precondition holds. Any one of these
  //    failing means a projection to normal would be an unsupportable promise.
  const canForecast =
    (result.responder_status === 'RESPONDING' || result.responder_status === 'TOO_EARLY') &&
    trend !== 'worsening' &&   // never project recovery on a falling hemoglobin
    !mixedBasis &&             // the target itself moved — "weeks to target" is meaningless
    latest.hb < cutoff;

  if (canForecast) {
    // Floored at half a week: a patient sitting just under the cutoff would
    // otherwise be told they reach their target "in about 0 weeks".
    const weeks = Math.max(0.5, r1((cutoff - latest.hb) / WEEKLY_RISE));
    const projection = [{ ts: latest.ts, hb: latest.hb }];
    for (let w = 1; w <= Math.ceil(weeks); w += 1) {
      projection.push({
        ts: latest.ts + w * 7 * DAY_MS,
        hb: r1(Math.min(cutoff, latest.hb + w * WEEKLY_RISE)),
      });
    }
    result.forecast = {
      weekly_rise: WEEKLY_RISE,
      target: cutoff,
      weeks_to_target: weeks,
      projected_ts: latest.ts + Math.round(weeks * 7 * DAY_MS),
      projection,
      basis: 'typical response to iron replacement — an estimate, not a promise',
    };
  } else if (trend === 'worsening') {
    // 7. Conservative escalation: a falling hemoglobin always warrants review,
    //    whatever the responder status says.
    result.defer_to_physician = true;
    result.deferral_reason = result.deferral_reason
      || `Hemoglobin has fallen ${Math.abs(observedRise)} g/dL since the start of this episode — physician review is recommended.`;
    result.recommendation = result.recommendation
      || 'Your hemoglobin is lower than at your first reading in this episode. Discuss this with your physician.';
  }

  return result;
}

module.exports = {
  forecastRecovery,
  episodeStartIndex,
  trendFromRise,
  WEEKLY_RISE,
  RESPONDER_MIN_RISE,
  ASSESS_MIN_DAYS,
  ASSESS_MAX_DAYS,
  STABLE_BAND,
};
