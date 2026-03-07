const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const { createSymptomSession } = require('../models/patientQueries');

// POST /api/disease/predict — saves session; real Diagnostic Agent added Day 4
router.post('/predict', verifyToken, async (req, res) => {
  const { symptoms } = req.body;

  if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ error: 'At least one symptom is required' });
  }

  try {
    const session = await createSymptomSession(req.user.userId, symptoms);
    // Day 4 will run the Gemini Diagnostic Agent here and return real diseases
    res.json({
      sessionId: session.id,
      status: 'pending',
      message: 'Session created. Diagnostic Agent coming Day 4.',
    });
  } catch (err) {
    console.error('Predict error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/disease/tests — get recommended blood tests for selected disease
router.post('/tests', verifyToken, (req, res) => {
  res.status(501).json({ message: 'Coming in Day 5' });
});

module.exports = router;
