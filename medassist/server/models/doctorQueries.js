const pool = require('../db/pool');

/**
 * Save a Doctor Assist session to the DB.
 * Uses patient_summary JSONB to store both the patient case and structured results.
 * suggested_tests TEXT[] stores just test names for quick display.
 */
async function saveDoctorAssistSession({ doctorId, patientCase, suggestions, steps, turns }) {
  const testNames = suggestions.map(s => s.test_name);

  const patientSummary = {
    ...patientCase,
    results: suggestions,
    agent_steps: steps.length,
    agent_turns: turns,
  };

  const { rows } = await pool.query(
    `INSERT INTO doctor_assist_sessions (doctor_id, patient_summary, suggested_tests)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [doctorId, JSON.stringify(patientSummary), testNames]
  );
  return rows[0];
}

/**
 * Get recent Doctor Assist sessions for a doctor.
 */
async function getDoctorAssistHistory(doctorId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT id, patient_summary, suggested_tests, created_at
     FROM doctor_assist_sessions
     WHERE doctor_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [doctorId, limit]
  );
  return rows;
}

/**
 * Get a doctor's profile (specialization, hospital, etc.)
 */
async function getDoctorProfile(userId) {
  const { rows } = await pool.query(
    `SELECT dp.*, u.full_name, u.email
     FROM doctor_profiles dp
     JOIN users u ON u.id = dp.user_id
     WHERE dp.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

module.exports = { saveDoctorAssistSession, getDoctorAssistHistory, getDoctorProfile };
