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

// POST /api/patient/supplement-log — toggle "taken today" for an ingredient
router.post('/supplement-log', verifyToken, async (req, res) => {
  const { ingredient_name } = req.body;
  if (!ingredient_name) return res.status(400).json({ error: 'ingredient_name is required' });

  const patientId = req.user.userId;
  const today = new Date().toISOString().split('T')[0];

  try {
    try {
      await pool.query(
        'INSERT INTO supplement_logs (patient_id, ingredient_name, taken_at) VALUES ($1, $2, $3)',
        [patientId, ingredient_name, today]
      );
      return res.json({ taken: true, ingredient_name });
    } catch (insertErr) {
      if (insertErr.code === '23505') {
        // UNIQUE violation → already taken → un-toggle
        await pool.query(
          'DELETE FROM supplement_logs WHERE patient_id = $1 AND ingredient_name = $2 AND taken_at = $3',
          [patientId, ingredient_name, today]
        );
        return res.json({ taken: false, ingredient_name });
      }
      throw insertErr;
    }
  } catch (err) {
    console.error('Supplement log toggle error:', err);
    return res.status(500).json({ error: 'Failed to update supplement log' });
  }
});

// GET /api/patient/supplement-log — today's taken ingredients + streaks
router.get('/supplement-log', verifyToken, async (req, res) => {
  const patientId = req.user.userId;
  const today = new Date().toISOString().split('T')[0];

  try {
    const { rows: todayRows } = await pool.query(
      'SELECT ingredient_name FROM supplement_logs WHERE patient_id = $1 AND taken_at = $2',
      [patientId, today]
    );

    const { rows: historyRows } = await pool.query(
      `SELECT ingredient_name, taken_at FROM supplement_logs
        WHERE patient_id = $1 AND taken_at >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY taken_at DESC`,
      [patientId]
    );

    // Group taken dates by ingredient
    const byIngredient = {};
    for (const r of historyRows) {
      const name = r.ingredient_name;
      if (!byIngredient[name]) byIngredient[name] = new Set();
      byIngredient[name].add(r.taken_at.toISOString().split('T')[0]);
    }

    // Compute consecutive-day streak backward from today
    const streaks = {};
    for (const [name, datesSet] of Object.entries(byIngredient)) {
      let streak = 0;
      const d = new Date(today);
      while (true) {
        const ds = d.toISOString().split('T')[0];
        if (datesSet.has(ds)) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }
      streaks[name] = streak;
    }

    return res.json({ today: todayRows.map((r) => r.ingredient_name), streaks });
  } catch (err) {
    console.error('Get supplement log error:', err);
    return res.status(500).json({ error: 'Failed to fetch supplement log' });
  }
});

// GET /api/patient/badges — compute engagement badges
router.get('/badges', verifyToken, async (req, res) => {
  const patientId = req.user.userId;

  try {
    const { rows: reports } = await pool.query(
      `SELECT id, created_at, extracted_values, analysis, follow_up
         FROM blood_reports
        WHERE patient_id = $1 AND session_id IS NULL
        ORDER BY created_at ASC`,
      [patientId]
    );

    const analyzed = reports.filter(
      (r) => r.analysis && (r.analysis.summary || r.analysis.abnormal_findings?.length > 0)
    );

    const badges = [];

    if (analyzed.length >= 1) {
      badges.push({ id: 'first_report', label: 'First Report', icon: '🩸', description: 'Uploaded and analyzed your first blood report' });
    }

    if (analyzed.length >= 3) {
      badges.push({ id: 'on_track', label: 'On Track', icon: '📈', description: 'Has 3 or more analyzed reports — great consistency!' });
    }

    // Improving: any abnormal parameter status improved between last 2 reports
    if (analyzed.length >= 2) {
      const older = analyzed[analyzed.length - 2];
      const newer = analyzed[analyzed.length - 1];
      const olderAbnormal = older.analysis?.abnormal_findings || [];
      const newerExtracted = newer.extracted_values || [];

      let improving = false;
      for (const finding of olderAbnormal) {
        const name = finding.parameter?.toLowerCase();
        const newVal = newerExtracted.find((v) => v.parameter?.toLowerCase() === name);
        if (!newVal) continue;
        const oldSt = finding.status;
        const newSt = newVal.status;
        if (['high', 'critical_high', 'low', 'critical_low'].includes(oldSt) && newSt === 'normal') {
          improving = true; break;
        }
        if ((oldSt === 'critical_high' && newSt === 'high') || (oldSt === 'critical_low' && newSt === 'low')) {
          improving = true; break;
        }
      }
      if (improving) {
        badges.push({ id: 'improving', label: 'Improving', icon: '✅', description: 'A parameter moved closer to normal range between your last two reports' });
      }
    }

    // Follow-up Champion: newest report uploaded within the recheck window of the second-to-last
    if (analyzed.length >= 2) {
      const penultimate = analyzed[analyzed.length - 2];
      const latest = analyzed[analyzed.length - 1];
      const fu = penultimate.follow_up;
      if (fu) {
        const items = Array.isArray(fu) ? fu : [fu];
        for (const item of items) {
          const recheckIn = item.recheck_in || item.timeframe || '';
          const m = recheckIn.match(/(\d+)\s*(day|week|month)s?/i);
          if (!m) continue;
          let days = parseInt(m[1]);
          const unit = m[2].toLowerCase();
          if (unit === 'week') days *= 7;
          if (unit === 'month') days *= 30;
          const diffDays = (new Date(latest.created_at) - new Date(penultimate.created_at)) / 86400000;
          if (diffDays <= days) {
            badges.push({ id: 'followup_champion', label: 'Follow-up Champion', icon: '🔁', description: 'Uploaded a new report within the recommended recheck window' });
            break;
          }
        }
      }
    }

    return res.json({ badges });
  } catch (err) {
    console.error('Badges error:', err);
    return res.status(500).json({ error: 'Failed to compute badges' });
  }
});

module.exports = router;
