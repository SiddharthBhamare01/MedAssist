/**
 * Validation figures for the recovery-forecast engine.
 *
 * Numbers come from `medassist/server/tests/recovery/runForecast.js` — regenerate
 * after any change to `services/recoveryForecast.js`.
 *
 * Deliberately NOT reported as sensitivity/specificity: the forecast is not a
 * binary classifier, so those figures would be meaningless here. What is measured
 * is refusal discipline — how reliably the engine declines to project a recovery
 * it cannot support (a falling hemoglobin, a moved cutoff, a non-iron anemia,
 * a relapse, a single reading).
 */

export const RECOVERY_VALIDATION = {
  journeys: 30,
  missedNonResponders: 0,     // the safety-critical metric — someone wrongly told they are on track
  unsupportableForecasts: 0,  // a projection offered where the data cannot support one
  fieldAccuracy: 100,         // responder_status / trend / forecast-offered exact-match
  forecastsWithheld: 21,      // of 30 journeys — the engine declines far more often than it projects
  sources: [
    'Am J Medicine 5-trial analysis — ≈1 g/dL per week; responder ≥1 g/dL at day 14',
    'WHO 2024 — haemoglobin cutoffs to define anaemia (recovery target)',
    'AGA 2020 — IDA guideline (non-response workup: GI blood loss / malabsorption)',
  ],
};
