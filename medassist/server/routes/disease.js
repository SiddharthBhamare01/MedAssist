const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const { createSymptomSession, getPatientProfile } = require('../models/patientQueries');
const { runDiagnosticAgent } = require('../agents/diagnosticAgent');

// POST /api/disease/predict — runs Gemini Diagnostic Agent
router.post('/predict', verifyToken, async (req, res) => {
  const { symptoms } = req.body;

  if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ error: 'At least one symptom is required' });
  }

  try {
    // Create session first so we have an ID
    const session = await createSymptomSession(req.user.userId, symptoms);
    const sessionId = session.id;

    // Fetch patient profile for personalised diagnosis
    const patientProfile = await getPatientProfile(req.user.userId);

    // Run Diagnostic Agent (Gemini multi-turn with ICD tool calls)
    const { diseases, steps, turns } = await runDiagnosticAgent({
      sessionId,
      symptoms,
      patientProfile,
    });

    res.json({ sessionId, diseases, agentSteps: steps, turns });
  } catch (err) {
    console.error('Diagnostic agent error:', err);
    res.status(500).json({ error: 'Diagnostic agent failed. Please try again.' });
  }
});

// POST /api/disease/tests — get recommended blood tests for selected disease
router.post('/tests', verifyToken, (req, res) => {
  res.status(501).json({ message: 'Coming in Day 5' });
});

module.exports = router;
