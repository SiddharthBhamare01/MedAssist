const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const pool = require('../db/pool');
const {
  getPatientProfile,
  upsertPatientProfile,
} = require('../models/patientQueries');

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

// GET /api/patient/vitals — get patient's vitals (query: type, days)
router.get('/vitals', verifyToken, async (req, res) => {
  try {
    const { type, days } = req.query;
    let query = 'SELECT * FROM vitals_logs WHERE patient_id = $1';
    const params = [req.user.userId];

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }
    if (days) {
      params.push(parseInt(days));
      query += ` AND recorded_at >= NOW() - INTERVAL '1 day' * $${params.length}`;
    }

    query += ' ORDER BY recorded_at DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    res.json({ vitals: rows });
  } catch (err) {
    console.error('Get vitals error:', err);
    res.status(500).json({ error: 'Failed to fetch vitals' });
  }
});

// POST /api/patient/vitals — save a new vital reading
router.post('/vitals', verifyToken, async (req, res) => {
  const { type, value, value2, unit } = req.body;
  if (!type || value === undefined) {
    return res.status(400).json({ error: 'type and value are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO vitals_logs (patient_id, type, value, value2, unit)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.userId, type, value, value2 || null, unit || null]
    );
    res.status(201).json({ vital: rows[0] });
  } catch (err) {
    console.error('Save vital error:', err);
    res.status(500).json({ error: 'Failed to save vital' });
  }
});

module.exports = router;
