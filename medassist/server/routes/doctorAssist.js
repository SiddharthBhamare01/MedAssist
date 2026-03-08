const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const { runDoctorAssistAgent } = require('../agents/doctorAssistAgent');
const { saveDoctorAssistSession, getDoctorAssistHistory, getDoctorProfile } = require('../models/doctorQueries');
const { getEmitter } = require('../utils/eventEmitter');

/**
 * POST /api/doctor-assist/suggest-tests
 * Runs the Doctor Assist Agent and returns suggested missing tests.
 * Body: { patientCase: { age, gender, weight, height, chiefComplaint, symptoms, duration, knownConditions }, existingTests: string[] }
 */
router.post('/suggest-tests', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  const { patientCase, existingTests = [] } = req.body;

  if (!patientCase?.chiefComplaint || !patientCase?.symptoms) {
    return res.status(400).json({ error: 'chiefComplaint and symptoms are required' });
  }

  // Generate a session ID for SSE tracking
  const sessionId = `doctor-${req.user.userId}-${Date.now()}`;

  try {
    // Run agent (async — SSE will stream steps)
    const {
      suggestions, coveredTests, essentialTests,
      diseaseConfirmed, icdCode, allCovered, steps, turns,
    } = await runDoctorAssistAgent({ sessionId, patientCase, existingTests });

    // Save session to DB
    const session = await saveDoctorAssistSession({
      doctorId: req.user.userId,
      patientCase,
      suggestions,
      steps,
      turns,
    });

    // Save to agent_logs table
    const pool = require('../db/pool');
    await pool.query(
      `INSERT INTO agent_logs (session_id, agent_name, steps, total_turns)
       VALUES ($1, $2, $3, $4)`,
      [session.id, 'doctorAssistAgent', JSON.stringify(steps), turns]
    );

    res.json({
      sessionId: session.id,
      suggestions,
      coveredTests,
      essentialTests,
      diseaseConfirmed,
      icdCode,
      allCovered,
      turns,
      stepsCount: steps.length,
    });
  } catch (err) {
    console.error('Doctor Assist Agent error:', err);
    res.status(500).json({ error: 'Agent failed: ' + err.message });
  }
});

/**
 * GET /api/doctor-assist/sessions
 * Returns recent Doctor Assist sessions for the logged-in doctor.
 */
router.get('/sessions', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    const sessions = await getDoctorAssistHistory(req.user.userId, 10);
    res.json({ sessions });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /api/doctor-assist/profile
 * Returns the logged-in doctor's profile (name, specialization, hospital).
 */
router.get('/profile', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    const profile = await getDoctorProfile(req.user.userId);
    res.json({ profile });
  } catch (err) {
    console.error('Get doctor profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/doctor-assist/profile
 * Upsert the doctor's clinic profile (specialization, hospital, city, state, phone).
 */
router.put('/profile', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }
  // Sanitize — convert undefined/empty strings to null for clean DB storage
  const specialization = req.body.specialization || null;
  const hospital_name  = req.body.hospital_name  || null;
  const city           = req.body.city           || null;
  const state          = req.body.state          || null;
  const phone          = req.body.phone          || null;
  try {
    const pool = require('../db/pool');
    // Check if profile row exists
    const existing = await pool.query(
      'SELECT id FROM doctor_profiles WHERE user_id = $1', [req.user.userId]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE doctor_profiles
         SET specialization=$2, hospital_name=$3, city=$4, state=$5, phone=$6
         WHERE user_id=$1`,
        [req.user.userId, specialization, hospital_name, city, state, phone]
      );
    } else {
      await pool.query(
        `INSERT INTO doctor_profiles (user_id, specialization, hospital_name, city, state, phone, available)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
        [req.user.userId, specialization, hospital_name, city, state, phone]
      );
    }
    const profile = await getDoctorProfile(req.user.userId);
    res.json({ profile });
  } catch (err) {
    console.error('Update doctor profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
