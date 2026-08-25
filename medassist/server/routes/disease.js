const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const { runDiagnosticAgent } = require('../agents/diagnosticAgent');
const { getRecommendedBloodTests } = require('../services/groqService');
const {
  createSymptomSession,
  getPatientProfile,
  updateSessionDiseases,
  updateSessionTests,
  saveAgentLog,
} = require('../models/patientQueries');

/**
 * POST /api/disease/predict
 * Flags conditions a clinician may want to rule out for the submitted symptoms,
 * with questions for the patient to ask. This is NOT a diagnosis and returns no
 * likelihood — see agents/diagnosticAgent.js for the Phase 2 review reframe.
 * Body:    { symptoms: [{ name, severity, duration, onset }] }
 * Returns: { sessionId, considerations, diseases (alias), disclaimer, turns }
 *          Any client rendering `considerations` MUST render `disclaimer` too.
 */
router.post('/predict', verifyToken, async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Patient access only' });
  }

  const { symptoms } = req.body;
  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ error: 'symptoms array is required and must not be empty' });
  }

  try {
    const patientId = req.user.userId;
    const profile = await getPatientProfile(patientId).catch(() => null);

    // Create a session row before running the agent
    const session = await createSymptomSession(patientId, symptoms);
    const sessionId = session.id;

    const { considerations, disclaimer, turns } = await runDiagnosticAgent(symptoms, profile);

    // Persist results + log
    await updateSessionDiseases(sessionId, considerations);
    await saveAgentLog({
      sessionId,
      agentName: 'diagnosticAgent',
      steps: [{ type: 'ensemble', description: `Ran symptom flagging — ${turns} provider(s)` }],
      totalTurns: turns,
    });

    // `diseases` is kept as an alias so existing callers keep working; it holds
    // the same objects. New callers should read `considerations` and must show
    // `disclaimer` alongside them.
    return res.json({ sessionId, considerations, diseases: considerations, disclaimer, turns });
  } catch (err) {
    console.error('Diagnostic Agent error:', err);
    return res.status(500).json({ error: 'Diagnostic Agent failed: ' + err.message });
  }
});

/**
 * POST /api/disease/tests
 * Returns the blood tests a clinician would typically order to confirm or
 * exclude a flagged condition.
 * Body: { sessionId, disease: { disease | condition, icd_code } }
 *       `icd_code` is an internal lookup reference, not a diagnosis.
 */
router.post('/tests', verifyToken, async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Patient access only' });
  }

  const { sessionId, disease } = req.body;
  // Accept `condition` (the reframed field) or `disease` (the original alias).
  const name = disease?.condition || disease?.disease;
  if (!name || !disease?.icd_code) {
    return res.status(400).json({ error: 'disease object with condition (or disease) and icd_code is required' });
  }

  try {
    const patientId = req.user.userId;
    const profile = await getPatientProfile(patientId).catch(() => null);

    const tests = await getRecommendedBloodTests(disease, profile);

    if (sessionId) {
      await updateSessionTests(sessionId, tests).catch((e) =>
        console.warn('[disease] Could not save tests to session:', e.message)
      );
    }

    return res.json({ sessionId: sessionId || null, tests });
  } catch (err) {
    console.error('Blood tests recommendation error:', err);
    return res.status(500).json({ error: 'Failed to get test recommendations: ' + err.message });
  }
});

module.exports = router;
