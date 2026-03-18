const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const {
  createSymptomSession,
  getPatientProfile,
  updateSessionTests,
  updateSessionStatus,
} = require('../models/patientQueries');
const { runDiagnosticAgent } = require('../agents/diagnosticAgent');
const { getRecommendedBloodTests } = require('../services/groqService');

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

    const { diseases, steps, turns } = await runDiagnosticAgent({
      sessionId,
      symptoms,
      patientProfile,
    });

    // Advance status — agent completed successfully
    await updateSessionStatus(sessionId, 'diagnosed');

    res.json({ sessionId, diseases, agentSteps: steps, turns });
  } catch (err) {
    console.error('Diagnostic agent error:', err);
    res.status(500).json({ error: 'Diagnostic agent failed. Please try again.' });
  }
});

// POST /api/disease/predict/retry/:sessionId — re-run agent for a stale pending session
router.post('/predict/retry/:sessionId', verifyToken, async (req, res) => {
  const { sessionId } = req.params;
  try {
    // Load existing session (ownership check via patient_id)
    const { rows } = await require('../db/pool').query(
      'SELECT * FROM symptom_sessions WHERE id = $1 AND patient_id = $2',
      [sessionId, req.user.userId]
    );
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'pending') {
      return res.status(400).json({ error: 'Session is not in pending state', status: session.status });
    }

    const symptoms = Array.isArray(session.symptoms)
      ? session.symptoms
      : JSON.parse(session.symptoms || '[]');

    if (!symptoms.length) return res.status(400).json({ error: 'No symptoms found in session' });

    const patientProfile = await getPatientProfile(req.user.userId);

    const { diseases, steps, turns } = await runDiagnosticAgent({
      sessionId,
      symptoms,
      patientProfile,
    });

    await updateSessionStatus(sessionId, 'diagnosed');
    res.json({ sessionId, diseases, agentSteps: steps, turns });
  } catch (err) {
    console.error('Retry diagnostic agent error:', err);
    res.status(500).json({ error: 'Diagnostic agent failed. Please try again.' });
  }
});

// POST /api/disease/tests — get recommended blood tests for selected disease
router.post('/tests', verifyToken, async (req, res) => {
  const { sessionId, disease } = req.body;

  if (!sessionId || !disease) {
    return res.status(400).json({ error: 'sessionId and disease are required' });
  }

  try {
    const patientProfile = await getPatientProfile(req.user.userId);
    const tests = await getRecommendedBloodTests(disease, patientProfile);

    // Persist tests + advance status
    await updateSessionTests(sessionId, tests);
    await updateSessionStatus(sessionId, 'tests_ready');

    res.json({ sessionId, disease: disease.disease, tests });
  } catch (err) {
    console.error('Blood test recommendation error:', err);
    res.status(500).json({ error: 'Failed to get blood test recommendations. Please try again.' });
  }
});

module.exports = router;
