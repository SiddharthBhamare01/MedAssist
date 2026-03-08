const pool = require('../db/pool');

async function getPatientProfile(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM patient_profiles WHERE user_id = $1',
    [userId]
  );
  return rows[0] || null;
}

async function upsertPatientProfile(userId, data) {
  const {
    age, gender, weightKg, heightCm, bloodGroup,
    existingConditions, allergies, currentMedications,
    smokingStatus, alcoholUse,
  } = data;

  const existing = await getPatientProfile(userId);

  if (existing) {
    const { rows } = await pool.query(
      `UPDATE patient_profiles SET
         age=$2, gender=$3, weight_kg=$4, height_cm=$5, blood_group=$6,
         existing_conditions=$7, allergies=$8, current_medications=$9,
         smoking_status=$10, alcohol_use=$11, updated_at=NOW()
       WHERE user_id=$1
       RETURNING *`,
      [
        userId, age, gender, weightKg, heightCm, bloodGroup,
        existingConditions, allergies, currentMedications,
        smokingStatus, alcoholUse,
      ]
    );
    return rows[0];
  } else {
    const { rows } = await pool.query(
      `INSERT INTO patient_profiles
         (user_id, age, gender, weight_kg, height_cm, blood_group,
          existing_conditions, allergies, current_medications,
          smoking_status, alcohol_use)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        userId, age, gender, weightKg, heightCm, bloodGroup,
        existingConditions, allergies, currentMedications,
        smokingStatus, alcoholUse,
      ]
    );
    return rows[0];
  }
}

async function createSymptomSession(patientId, symptoms) {
  const { rows } = await pool.query(
    `INSERT INTO symptom_sessions (patient_id, symptoms)
     VALUES ($1, $2)
     RETURNING id`,
    [patientId, JSON.stringify(symptoms)]
  );
  return rows[0];
}

async function getSymptomSession(sessionId) {
  const { rows } = await pool.query(
    'SELECT * FROM symptom_sessions WHERE id = $1',
    [sessionId]
  );
  return rows[0] || null;
}

async function updateSessionDiseases(sessionId, diseases) {
  await pool.query(
    'UPDATE symptom_sessions SET predicted_diseases = $1 WHERE id = $2',
    [JSON.stringify(diseases), sessionId]
  );
}

async function saveAgentLog({ sessionId, agentName, steps, totalTurns }) {
  await pool.query(
    `INSERT INTO agent_logs (session_id, agent_name, steps, total_turns)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, agentName, JSON.stringify(steps), totalTurns]
  );
}

async function updateSessionTests(sessionId, tests) {
  await pool.query(
    'UPDATE symptom_sessions SET recommended_tests = $1::jsonb WHERE id = $2',
    [JSON.stringify(tests), sessionId]
  );
}

module.exports = {
  getPatientProfile, upsertPatientProfile,
  createSymptomSession, getSymptomSession,
  updateSessionDiseases, saveAgentLog, updateSessionTests,
};
