const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const verifyToken = require('../middleware/auth');
const pool = require('../db/pool');
const { runDoctorAssistAgent } = require('../agents/doctorAssistAgent');
const { saveDoctorAssistSession, getDoctorAssistHistory, getDoctorProfile } = require('../models/doctorQueries');
const { getEmitter } = require('../utils/eventEmitter');
const { generateSessionPDF } = require('../services/pdfService');
const auditLog = require('../middleware/audit');

// Rate limit only the AI agent endpoint, not DB-query routes
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests. Please wait a moment.' },
});

/**
 * POST /api/doctor-assist/suggest-tests
 * Runs the Doctor Assist Agent and returns suggested missing tests.
 * Body: { patientCase: { age, gender, weight, height, chiefComplaint, symptoms, duration, knownConditions }, existingTests: string[] }
 */
router.post('/suggest-tests', agentLimiter, verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  const { patientCase, existingTests = [] } = req.body;

  if (!patientCase?.chiefComplaint || !patientCase?.symptoms) {
    return res.status(400).json({ error: 'chiefComplaint and symptoms are required' });
  }

  // Generate a session ID for SSE tracking
  const sessionId = `doctor-${req.user.userId}-${Date.now()}`;

  try {
    // Run agent (async — SSE will stream steps)
    const {
      suggestions, coveredTests, essentialTests,
      diseaseConfirmed, icdCode, allCovered, steps, turns,
    } = await runDoctorAssistAgent({ sessionId, patientCase, existingTests });

    // Save session to DB
    const session = await saveDoctorAssistSession({
      doctorId: req.user.userId,
      patientCase,
      suggestions,
      steps,
      turns,
    });

    // Save to agent_logs table
    const pool = require('../db/pool');
    await pool.query(
      `INSERT INTO agent_logs (session_id, agent_name, steps, total_turns)
       VALUES ($1, $2, $3, $4)`,
      [session.id, 'doctorAssistAgent', JSON.stringify(steps), turns]
    );

    res.json({
      sessionId: session.id,
      suggestions,
      coveredTests,
      essentialTests,
      diseaseConfirmed,
      icdCode,
      allCovered,
      turns,
      stepsCount: steps.length,
    });
  } catch (err) {
    console.error('Doctor Assist Agent error:', err);
    res.status(500).json({ error: 'Agent failed: ' + err.message });
  }
});

/**
 * GET /api/doctor-assist/sessions
 * Returns recent Doctor Assist sessions for the logged-in doctor.
 */
router.get('/sessions', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    const sessions = await getDoctorAssistHistory(req.user.userId, 10);
    res.json({ sessions });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /api/doctor-assist/profile
 * Returns the logged-in doctor's profile (name, specialization, hospital).
 */
router.get('/profile', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    const profile = await getDoctorProfile(req.user.userId);
    res.json({ profile });
  } catch (err) {
    console.error('Get doctor profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/doctor-assist/profile
 * Upsert the doctor's clinic profile (specialization, hospital, city, state, phone).
 */
router.put('/profile', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }
  // Sanitize — convert undefined/empty strings to null for clean DB storage
  const specialization = req.body.specialization || null;
  const hospital_name  = req.body.hospital_name  || null;
  const city           = req.body.city           || null;
  const state          = req.body.state          || null;
  const phone          = req.body.phone          || null;
  try {
    const pool = require('../db/pool');
    // Check if profile row exists
    const existing = await pool.query(
      'SELECT id FROM doctor_profiles WHERE user_id = $1', [req.user.userId]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE doctor_profiles
         SET specialization=$2, hospital_name=$3, city=$4, state=$5, phone=$6
         WHERE user_id=$1`,
        [req.user.userId, specialization, hospital_name, city, state, phone]
      );
    } else {
      await pool.query(
        `INSERT INTO doctor_profiles (user_id, specialization, hospital_name, city, state, phone, available)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
        [req.user.userId, specialization, hospital_name, city, state, phone]
      );
    }
    const profile = await getDoctorProfile(req.user.userId);
    res.json({ profile });
  } catch (err) {
    console.error('Update doctor profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/doctor-assist/shared-reports — list reports shared with this doctor
router.get('/shared-reports', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT rs.*, s.selected_disease, s.symptoms, s.status AS session_status,
              u.full_name AS patient_name
       FROM report_shares rs
       JOIN symptom_sessions s ON s.id = rs.session_id
       JOIN users u ON u.id = rs.patient_id
       JOIN patient_doctor_access pda ON pda.patient_id = rs.patient_id AND pda.doctor_id = $1 AND pda.revoked_at IS NULL
       WHERE rs.expires_at > NOW()
       ORDER BY rs.id DESC`,
      [req.user.userId]
    );
    res.json({ reports: rows });
  } catch (err) {
    console.error('Get shared reports error:', err);
    res.status(500).json({ error: 'Failed to fetch shared reports' });
  }
});

// POST /api/doctor-assist/prescriptions — create a prescription
router.post('/prescriptions', verifyToken, auditLog('create', 'prescription'), async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  const { patient_case, medications, notes } = req.body;
  if (!medications || !Array.isArray(medications)) {
    return res.status(400).json({ error: 'medications array is required' });
  }

  const patientId = patient_case?.patient_id || null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO prescriptions (doctor_id, patient_id, patient_case, medications, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.userId, patientId, patient_case || null, JSON.stringify(medications), notes || null]
    );

    const prescription = rows[0];

    // Send email notification to patient if linked
    if (patientId) {
      try {
        const { rows: patientRows } = await pool.query('SELECT email, full_name FROM users WHERE id = $1', [patientId]);
        if (patientRows.length > 0) {
          const { sendEmail } = require('../services/emailService');
          const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
          const medList = medications.map(m =>
            `<li><strong>${m.drug_name}</strong> — ${m.dosage || ''} ${m.frequency || ''} ${m.duration ? `for ${m.duration}` : ''}</li>`
          ).join('');

          await sendEmail({
            to: patientRows[0].email,
            subject: 'MedAssist AI — New Prescription from Your Doctor',
            html: `
              <h2>New Prescription</h2>
              <p>Dr. ${req.user.name} has written a prescription for you.</p>
              <h3>Medications:</h3>
              <ul>${medList}</ul>
              ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
              <p style="margin-top:20px;">
                <a href="${clientUrl}/patient/prescriptions" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;">
                  View Prescription
                </a>
              </p>
              <p style="color:#666;font-size:12px;margin-top:16px;">MedAssist AI — Your AI Health Assistant</p>
            `,
          });
        }
      } catch (emailErr) {
        console.error('Prescription email notification failed:', emailErr.message);
        // Don't fail the request — prescription is already saved
      }
    }

    res.status(201).json({ prescription });
  } catch (err) {
    console.error('Create prescription error:', err);
    res.status(500).json({ error: 'Failed to create prescription' });
  }
});

// GET /api/doctor-assist/prescriptions — list doctor's prescriptions
router.get('/prescriptions', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM prescriptions
       WHERE doctor_id = $1
       ORDER BY issued_at DESC LIMIT 50`,
      [req.user.userId]
    );
    res.json({ prescriptions: rows });
  } catch (err) {
    console.error('Get prescriptions error:', err);
    res.status(500).json({ error: 'Failed to fetch prescriptions' });
  }
});

// GET /api/doctor-assist/prescriptions/:id/pdf — generate prescription PDF
router.get('/prescriptions/:id/pdf', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM prescriptions WHERE id = $1 AND doctor_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    const rx = rows[0];
    const meds = typeof rx.medications === 'string' ? JSON.parse(rx.medications) : (rx.medications || []);

    const pdfBuffer = await generateSessionPDF({
      patientName: rx.patient_case || 'Patient',
      disease: 'Prescription',
      symptoms: [],
      analysis: {
        summary: { overall_assessment: `Prescription issued on ${new Date(rx.issued_at).toLocaleDateString()}` },
        treatment_solutions: rx.notes ? [rx.notes] : [],
      },
      tabletRecommendations: meds,
      riskScores: null,
      followUp: null,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Prescription_${req.params.id}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Prescription PDF error:', err);
    res.status(500).json({ error: 'Failed to generate prescription PDF' });
  }
});

// GET /api/doctor-assist/drug-interactions?drugs=x,y — AI ensemble drug interaction check
router.get('/drug-interactions', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  const { drugs } = req.query;
  if (!drugs) {
    return res.status(400).json({ error: 'drugs query parameter is required (comma-separated)' });
  }

  try {
    const drugList = drugs.split(',').map((d) => d.trim()).filter(Boolean);

    if (drugList.length < 2) {
      return res.json({ interactions: [], message: 'Need at least 2 drugs to check interactions' });
    }

    const { runEnsembleWithConsensus } = require('../agents/ensembleRunner');

    const systemPrompt = `You are a clinical pharmacology expert. Analyze drug-drug interactions with evidence-based medical knowledge.
Return ONLY a valid JSON object with this exact structure:
{
  "interactions": [
    {
      "drugs": ["Drug A", "Drug B"],
      "severity": "Major|Moderate|Minor|None",
      "mechanism": "Brief pharmacological mechanism",
      "description": "Clinical significance and what can happen",
      "recommendation": "What the prescriber should do"
    }
  ],
  "summary": "One paragraph overall safety assessment",
  "safe_combinations": ["Drug A + Drug C"]
}
Include ALL pairwise combinations. If no interaction exists between a pair, include it with severity "None".
Be thorough, accurate, and cite mechanism of action.`;

    const userMessage = `Check all drug-drug interactions between these medications: ${drugList.join(', ')}

For each pair of drugs, determine:
1. Whether they interact
2. The severity (Major/Moderate/Minor/None)
3. The pharmacological mechanism
4. Clinical recommendation

Drugs to check: ${drugList.map((d, i) => `${i + 1}. ${d}`).join('\n')}`;

    const { consensusRaw, agentCount } = await runEnsembleWithConsensus(
      systemPrompt, userMessage, 'drug_interactions', 3000
    );

    // Parse the consensus JSON
    let result;
    try {
      result = JSON.parse(consensusRaw);
    } catch {
      // If JSON parse fails, try to extract JSON from the response
      const jsonMatch = consensusRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = { interactions: [], summary: consensusRaw };
      }
    }

    res.json({
      ...result,
      agentCount,
      drugList,
    });
  } catch (err) {
    console.error('Drug interactions error:', err);
    res.status(500).json({ error: 'Failed to check drug interactions' });
  }
});

// POST /api/doctor-assist/patients — add patient to doctor's panel
router.post('/patients', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  const { patient_id, notes } = req.body;
  if (!patient_id) {
    return res.status(400).json({ error: 'patient_id is required' });
  }

  try {
    // Verify patient exists
    const { rows: userRows } = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'patient'",
      [patient_id]
    );
    if (!userRows.length) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO doctor_patients (doctor_id, patient_id, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.user.userId, patient_id, notes || null]
    );

    res.status(201).json({ record: rows[0] || { doctor_id: req.user.userId, patient_id, notes } });
  } catch (err) {
    console.error('Add patient error:', err);
    res.status(500).json({ error: 'Failed to add patient' });
  }
});

// GET /api/doctor-assist/patients — list doctor's panel patients + all patients fallback
router.get('/patients', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    // First try doctor's own panel
    const { rows: panelRows } = await pool.query(
      `SELECT dp.patient_id, dp.notes, dp.added_at,
              u.full_name AS patient_name, u.email AS patient_email
       FROM doctor_patients dp
       JOIN users u ON u.id = dp.patient_id
       WHERE dp.doctor_id = $1
       ORDER BY dp.added_at DESC`,
      [req.user.userId]
    );

    // If doctor has panel patients, return those; otherwise return all patients
    if (panelRows.length > 0) {
      return res.json({ patients: panelRows, source: 'panel' });
    }

    // Fallback: all registered patients
    const { rows: allRows } = await pool.query(
      `SELECT u.id AS patient_id, u.full_name AS patient_name, u.email AS patient_email
       FROM users u
       WHERE u.role = 'patient'
       ORDER BY u.full_name`
    );
    res.json({ patients: allRows, source: 'all' });
  } catch (err) {
    console.error('Get patients error:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// PUT /api/doctor-assist/sessions/:id/notes — save clinical notes to a session
router.put('/sessions/:id/notes', verifyToken, auditLog('update_notes', 'doctor_assist_session'), async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  const { clinical_notes } = req.body;
  if (!clinical_notes) {
    return res.status(400).json({ error: 'clinical_notes is required' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE doctor_assist_sessions SET clinical_notes = $1
       WHERE id = $2 AND doctor_id = $3
       RETURNING id, clinical_notes`,
      [clinical_notes, req.params.id, req.user.userId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session: rows[0] });
  } catch (err) {
    console.error('Save clinical notes error:', err);
    res.status(500).json({ error: 'Failed to save clinical notes' });
  }
});

// GET /api/doctor-assist/analytics — aggregate stats for doctor dashboard
router.get('/analytics', verifyToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access only' });
  }

  try {
    const [sessionsRes, patientsRes, prescriptionsRes] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) AS total_sessions FROM doctor_assist_sessions WHERE doctor_id = $1',
        [req.user.userId]
      ),
      pool.query(
        'SELECT COUNT(*) AS total_patients FROM doctor_patients WHERE doctor_id = $1',
        [req.user.userId]
      ),
      pool.query(
        'SELECT COUNT(*) AS total_prescriptions FROM prescriptions WHERE doctor_id = $1',
        [req.user.userId]
      ),
    ]);

    // Recent sessions by week
    const { rows: weekly } = await pool.query(
      `SELECT DATE_TRUNC('week', created_at) AS week, COUNT(*) AS count
       FROM doctor_assist_sessions
       WHERE doctor_id = $1 AND created_at >= NOW() - INTERVAL '8 weeks'
       GROUP BY week ORDER BY week`,
      [req.user.userId]
    );

    res.json({
      totalSessions: parseInt(sessionsRes.rows[0].total_sessions),
      totalPatients: parseInt(patientsRes.rows[0].total_patients),
      totalPrescriptions: parseInt(prescriptionsRes.rows[0].total_prescriptions),
      weeklyActivity: weekly,
    });
  } catch (err) {
    console.error('Doctor analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
