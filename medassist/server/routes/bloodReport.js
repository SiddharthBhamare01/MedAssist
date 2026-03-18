const router = require('express').Router();
const path = require('path');
const verifyToken = require('../middleware/auth');
const upload = require('../middleware/upload');
const { extractBloodValuesFromImage } = require('../services/geminiService');
const { runBloodReportAgent } = require('../agents/bloodReportAgent');
const { getPatientProfile, updateSessionStatus } = require('../models/patientQueries');
const pool = require('../db/pool');

// POST /api/blood-report/upload
// Step 1: upload file + OCR only → return extracted values immediately
router.post('/upload', verifyToken, upload.single('report'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const patientId = req.user.userId;
  const { sessionId } = req.body;
  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  const relativePath = path.relative(
    path.join(__dirname, '..'),
    filePath
  ).replace(/\\/g, '/');

  try {
    const extractedValues = await extractBloodValuesFromImage(filePath, mimeType);

    const { rows } = await pool.query(
      `INSERT INTO blood_reports
         (session_id, patient_id, image_path, extracted_values)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [sessionId || null, patientId, relativePath, JSON.stringify(extractedValues)]
    );

    // Advance session status if a sessionId was provided
    if (sessionId) {
      await updateSessionStatus(sessionId, 'report_uploaded').catch((e) =>
        console.warn('[bloodReport] Could not update session status:', e.message)
      );
    }

    return res.json({
      reportId: rows[0].id,
      extractedValues,
      count: extractedValues.length,
    });
  } catch (err) {
    console.error('Blood report upload error:', err);
    return res.status(500).json({ error: err.message || 'OCR extraction failed' });
  }
});

// POST /api/blood-report/analyze
// Step 2: run Blood Report Agent on previously uploaded report
router.post('/analyze', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  try {
    // Fetch the saved blood report
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const report = rows[0];

    // If already analyzed AND all sections are present, return cached result
    const cached = report.analysis;
    const cachedTabs = report.tablet_recommendations;
    const hasFullResult =
      cached &&
      cached.diet_plan &&
      cached.recovery_ingredients?.length > 0 &&
      cachedTabs?.length > 0;

    if (hasFullResult) {
      console.log(`[bloodReport] Returning cached analysis for report ${reportId}`);
      return res.json({
        reportId,
        analysis: cached,
        tabletRecommendations: cachedTabs,
        doctorReferralNeeded: report.complexity_flag || false,
        cached: true,
      });
    }

    // Incomplete or missing analysis — clear it and re-run the agent
    if (cached) {
      console.log(`[bloodReport] Cached analysis is incomplete — clearing and re-running agent`);
      await pool.query(
        'UPDATE blood_reports SET analysis = NULL, tablet_recommendations = NULL WHERE id = $1',
        [reportId]
      );
    }

    const extractedValues = report.extracted_values || [];
    // patientProfile may be null for users who skipped profile setup — agent handles null safely
    const patientProfile = await getPatientProfile(req.user.userId).catch(() => null);

    const { analysis, tabletRecommendations, doctorReferralNeeded, steps, turns } =
      await runBloodReportAgent({ reportId, extractedValues, patientProfile: patientProfile || null });

    // Advance session status if this report is linked to a session
    if (report.session_id) {
      await updateSessionStatus(report.session_id, 'analyzed').catch((e) =>
        console.warn('[bloodReport] Could not update session status:', e.message)
      );
    }

    return res.json({
      reportId,
      analysis,
      tabletRecommendations,
      doctorReferralNeeded,
      agentSteps: steps,
      turns,
    });
  } catch (err) {
    console.error('Blood report analysis error:', err);
    return res.status(500).json({ error: err.message || 'Blood Report Agent failed' });
  }
});

// GET /api/blood-report/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
});

module.exports = router;
