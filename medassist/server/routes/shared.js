const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

// GET /api/shared/:token — validate share token, return read-only session + analysis data
router.get('/shared/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT rs.*, s.symptoms, s.predicted_diseases, s.selected_disease,
              s.selected_disease_data, s.recommended_tests, s.status
       FROM report_shares rs
       JOIN symptom_sessions s ON s.id = rs.session_id
       WHERE rs.token = $1 AND rs.expires_at > NOW()`,
      [req.params.token]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Shared report not found or expired' });
    }

    const share = rows[0];

    // Mark as accessed
    await pool.query(
      'UPDATE report_shares SET accessed_at = NOW() WHERE id = $1',
      [share.id]
    );

    // Fetch blood report analysis if session has one
    let analysis = null;
    let tabletRecommendations = null;
    let riskScores = null;
    let followUp = null;

    const { rows: reportRows } = await pool.query(
      `SELECT analysis, tablet_recommendations, risk_scores, follow_up
       FROM blood_reports
       WHERE session_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [share.session_id]
    );

    if (reportRows.length) {
      analysis = reportRows[0].analysis;
      tabletRecommendations = reportRows[0].tablet_recommendations;
      riskScores = reportRows[0].risk_scores;
      followUp = reportRows[0].follow_up;
    }

    // Get patient name
    const { rows: userRows } = await pool.query(
      'SELECT full_name FROM users WHERE id = $1',
      [share.patient_id]
    );

    res.json({
      patientName: userRows[0]?.full_name || 'Patient',
      symptoms: share.symptoms,
      predictedDiseases: share.predicted_diseases,
      selectedDisease: share.selected_disease,
      selectedDiseaseData: share.selected_disease_data,
      recommendedTests: share.recommended_tests,
      status: share.status,
      analysis,
      tabletRecommendations,
      riskScores,
      followUp,
      sharedAt: share.id ? new Date() : null,
    });
  } catch (err) {
    console.error('Shared report error:', err);
    res.status(500).json({ error: 'Failed to fetch shared report' });
  }
});

// GET /api/shared/medical-id/:patientId?pin=xxxx — validate PIN, return medical ID data
router.get('/medical-id/:patientId', async (req, res) => {
  const { pin } = req.query;

  if (!pin) {
    return res.status(400).json({ error: 'PIN is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM medical_id WHERE patient_id = $1',
      [req.params.patientId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Medical ID not found' });
    }

    const medId = rows[0];

    if (!medId.pin_hash) {
      return res.status(400).json({ error: 'No PIN set for this medical ID' });
    }

    const valid = await bcrypt.compare(String(pin), medId.pin_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    // Get patient name
    const { rows: userRows } = await pool.query(
      'SELECT full_name FROM users WHERE id = $1',
      [req.params.patientId]
    );

    // Get patient profile for additional medical info
    const { rows: profileRows } = await pool.query(
      'SELECT blood_group, existing_conditions, allergies, current_medications FROM patient_profiles WHERE user_id = $1',
      [req.params.patientId]
    );

    res.json({
      patientName: userRows[0]?.full_name || 'Patient',
      emergencyName: medId.emergency_name,
      emergencyPhone: medId.emergency_phone,
      bloodType: medId.blood_type,
      organDonor: medId.organ_donor,
      criticalNotes: medId.critical_notes,
      profile: profileRows[0] || null,
    });
  } catch (err) {
    console.error('Medical ID lookup error:', err);
    res.status(500).json({ error: 'Failed to fetch medical ID' });
  }
});

module.exports = router;
