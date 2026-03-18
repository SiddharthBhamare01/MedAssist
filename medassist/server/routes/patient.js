const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const {
  getPatientProfile,
  upsertPatientProfile,
  getPatientSessions,
  getSessionById,
  updateSelectedDisease,
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

// GET /api/patient/sessions — list recent sessions with status + report linkage
router.get('/sessions', verifyToken, async (req, res) => {
  try {
    const sessions = await getPatientSessions(req.user.userId);
    res.json({ sessions });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/patient/sessions/:id — get a single session (ownership checked)
router.get('/sessions/:id', verifyToken, async (req, res) => {
  try {
    const session = await getSessionById(req.params.id, req.user.userId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session });
  } catch (err) {
    console.error('Get session by id error:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// PUT /api/patient/sessions/:id/disease — save selected disease + advance status
router.put('/sessions/:id/disease', verifyToken, async (req, res) => {
  const { disease } = req.body;
  if (!disease || !disease.disease) {
    return res.status(400).json({ error: 'disease object with disease name is required' });
  }

  try {
    // Verify session belongs to this patient before writing
    const existing = await getSessionById(req.params.id, req.user.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await updateSelectedDisease(req.params.id, disease);
    res.json({ ok: true });
  } catch (err) {
    console.error('Update selected disease error:', err);
    res.status(500).json({ error: 'Failed to save selected disease' });
  }
});

module.exports = router;
