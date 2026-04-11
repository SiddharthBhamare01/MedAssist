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

    // If already analyzed, return cached result (don't re-run agents)
    // Pass { force: true } in body to bypass cache and re-analyze
    const forceReanalyze = req.body.force === true;
    const cached = report.analysis;
    const cachedTabs = report.tablet_recommendations;
    const hasFullResult = !forceReanalyze && cached && (
      cached.summary ||
      cached.abnormal_findings?.length > 0 ||
      cached.diet_plan ||
      cachedTabs?.length > 0
    );

    if (hasFullResult) {
      console.log(`[bloodReport] Returning cached analysis for report ${reportId}`);
      return res.json({
        reportId,
        analysis: cached,
        tabletRecommendations: cachedTabs,
        doctorReferralNeeded: report.complexity_flag || false,
        riskScores: report.risk_scores || null,
        followUp: report.follow_up || null,
        cached: true,
      });
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

    // Auto-populate medication_logs from tablet recommendations
    if (tabletRecommendations?.length > 0) {
      try {
        for (const tab of tabletRecommendations) {
          const medName = tab.name || tab.generic_name;
          if (!medName) continue;
          // Check if already exists to avoid duplicates
          const { rows: existing } = await pool.query(
            `SELECT id FROM medication_logs
             WHERE patient_id = $1 AND medication_name = $2 AND report_id = $3`,
            [req.user.userId, medName, reportId]
          );
          if (existing.length === 0) {
            await pool.query(
              `INSERT INTO medication_logs (patient_id, medication_name, dose, report_id, active)
               VALUES ($1, $2, $3, $4, true)`,
              [req.user.userId, medName, tab.dosage || tab.dose || null, reportId]
            );
          }
        }
        console.log(`[bloodReport] Auto-populated ${tabletRecommendations.length} medications`);
      } catch (medErr) {
        console.warn('[bloodReport] Could not auto-populate medications:', medErr.message);
      }
    }

    // Fetch any previously calculated risk_scores / follow_up
    const { rows: updatedRows } = await pool.query(
      'SELECT risk_scores, follow_up FROM blood_reports WHERE id = $1',
      [reportId]
    );

    return res.json({
      reportId,
      analysis,
      tabletRecommendations,
      doctorReferralNeeded,
      riskScores: updatedRows[0]?.risk_scores || null,
      followUp: updatedRows[0]?.follow_up || null,
      agentSteps: steps,
      turns,
    });
  } catch (err) {
    console.error('Blood report analysis error:', err);
    return res.status(500).json({ error: err.message || 'Blood Report Agent failed' });
  }
});

// POST /api/blood-report/risk-scores — run risk scoring agent, save to blood_reports.risk_scores
router.post('/risk-scores', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const report = rows[0];
    const patientProfile = await getPatientProfile(req.user.userId).catch(() => null);

    const { runRiskScoringAgent } = require('../agents/riskScoringAgent');
    const riskScores = await runRiskScoringAgent({
      extractedValues: report.extracted_values || [],
      patientProfile: patientProfile || null,
    });

    await pool.query(
      'UPDATE blood_reports SET risk_scores = $1 WHERE id = $2',
      [JSON.stringify(riskScores), reportId]
    );

    return res.json({ reportId, riskScores });
  } catch (err) {
    console.error('Risk scores error:', err);
    return res.status(500).json({ error: err.message || 'Risk scoring failed' });
  }
});

// POST /api/blood-report/follow-up — run follow-up agent, save to blood_reports.follow_up
router.post('/follow-up', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const report = rows[0];

    const { runFollowUpAgent } = require('../agents/followUpAgent');
    const followUp = await runFollowUpAgent({
      abnormalFindings: report.analysis?.abnormal_findings || [],
      tabletRecommendations: report.tablet_recommendations || [],
    });

    await pool.query(
      'UPDATE blood_reports SET follow_up = $1 WHERE id = $2',
      [JSON.stringify(followUp), reportId]
    );

    return res.json({ reportId, followUp });
  } catch (err) {
    console.error('Follow-up error:', err);
    return res.status(500).json({ error: err.message || 'Follow-up agent failed' });
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
