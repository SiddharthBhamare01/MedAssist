const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const { getPatientProfile, upsertPatientProfile } = require('../models/patientQueries');

// GET /api/patient/profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const profile = await getPatientProfile(req.user.userId);
    res.json({ profile: profile || null });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/patient/profile
router.put('/profile', verifyToken, async (req, res) => {
  const {
    age, gender, weightKg, heightCm, bloodGroup,
    existingConditions, allergies, currentMedications,
    smokingStatus, alcoholUse,
  } = req.body;

  if (!age || !gender) {
    return res.status(400).json({ error: 'Age and gender are required' });
  }

  try {
    const profile = await upsertPatientProfile(req.user.userId, {
      age: parseInt(age),
      gender,
      weightKg: weightKg ? parseFloat(weightKg) : null,
      heightCm: heightCm ? parseFloat(heightCm) : null,
      bloodGroup: bloodGroup || null,
      existingConditions: existingConditions || [],
      allergies: allergies || [],
      currentMedications: currentMedications || [],
      smokingStatus: smokingStatus || null,
      alcoholUse: alcoholUse || null,
    });
    res.json({ profile });
  } catch (err) {
    console.error('Upsert profile error:', err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// GET /api/patient/sessions — recent symptom sessions for the logged-in patient
router.get('/sessions', verifyToken, async (req, res) => {
  try {
    const { rows } = await require('../db/pool').query(
      `SELECT id, symptoms, predicted_diseases, selected_disease, recommended_tests, created_at
       FROM symptom_sessions
       WHERE patient_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [req.user.userId]
    );
    res.json({ sessions: rows });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

module.exports = router;
