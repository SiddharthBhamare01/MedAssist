const router = require('express').Router();
const crypto = require('crypto');
const verifyToken = require('../middleware/auth');
const pool = require('../db/pool');
const {
  getPatientProfile,
  upsertPatientProfile,
  getPatientSessions,
} = require('../models/patientQueries');
const { getNearbyDoctors } = require('../services/osmService');

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

// GET /api/patient/vitals/insights?type=glucose — LLM-generated blood report correlation
// Cached 2h per patient+type in patient_profiles.vitals_insights JSONB
router.get('/vitals/insights', verifyToken, async (req, res) => {
  const patientId = req.user.userId;
  const { type } = req.query;
  if (!type) return res.status(400).json({ error: 'type is required' });

  // Check DB cache (2h TTL per type)
  try {
    const { rows: profileRows } = await pool.query(
      'SELECT vitals_insights FROM patient_profiles WHERE patient_id = $1',
      [patientId]
    );
    const cached = profileRows[0]?.vitals_insights?.[type];
    if (cached?.insight && cached?.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < 2 * 60 * 60 * 1000) {
        console.log(`[patient] Returning cached vitals insight for ${patientId}/${type}`);
        return res.json({ insight: cached.insight, cached: true });
      }
    }
  } catch {
    // If vitals_insights column doesn't exist yet (pre-migration), fall through
  }

  try {
    const { rows: vitalsRows } = await pool.query(
      `SELECT value, value2, recorded_at FROM vitals_logs
        WHERE patient_id = $1 AND type = $2
        ORDER BY recorded_at DESC LIMIT 7`,
      [patientId, type]
    );
    if (!vitalsRows.length) return res.json({ insight: null });

    const { rows: reportRows } = await pool.query(
      `SELECT extracted_values FROM blood_reports
        WHERE patient_id = $1 AND session_id IS NULL AND extracted_values IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );
    if (!reportRows.length) return res.json({ insight: null });

    const TYPE_LABEL = {
      glucose: 'blood glucose', blood_pressure: 'blood pressure',
      heart_rate: 'heart rate', weight: 'weight',
      spo2: 'oxygen saturation (SpO2)', temperature: 'body temperature',
    };
    const RELEVANT_KEYWORDS = {
      glucose:        ['hba1c', 'glucose', 'insulin', 'glycat'],
      blood_pressure: ['cholesterol', 'ldl', 'hdl', 'triglyceride', 'creatinine', 'sodium', 'potassium'],
      heart_rate:     ['hemoglobin', 'tsh', 'thyroid', 'potassium', 'sodium', 'calcium'],
      weight:         ['cholesterol', 'triglyceride', 'glucose', 'insulin'],
      spo2:           ['hemoglobin', 'rbc', 'wbc', 'hematocrit'],
      temperature:    ['wbc', 'neutrophil', 'lymphocyte', 'crp', 'esr'],
    };

    const keywords = RELEVANT_KEYWORDS[type] || [];
    const extractedValues = reportRows[0].extracted_values || [];

    let relevantFindings = extractedValues.filter((v) =>
      keywords.some((k) => (v.parameter || '').toLowerCase().includes(k))
    ).slice(0, 5);

    if (!relevantFindings.length) {
      relevantFindings = extractedValues.filter((v) => v.status && v.status !== 'normal').slice(0, 3);
    }
    if (!relevantFindings.length) return res.json({ insight: null });

    const readingsSummary = vitalsRows.slice(0, 5).map((v) => {
      const date = new Date(v.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return v.value2 ? `${v.value}/${v.value2} (${date})` : `${v.value} (${date})`;
    }).join(', ');

    const findingsSummary = relevantFindings.map((f) =>
      `${f.parameter}: ${f.value}${f.unit ? ' ' + f.unit : ''} [${f.status || 'normal'}]`
    ).join('; ');

    const prompt = `Explain in 1-2 sentences how this patient's recent ${TYPE_LABEL[type] || type} readings relate to their blood test results. Reference actual numbers. Do NOT give medical advice.

Recent ${TYPE_LABEL[type] || type}: ${readingsSummary}
Blood test results: ${findingsSummary}

Respond with exactly 1-2 sentences, under 50 words.`;

    const { getProviders, getAvailableProviders } = require('../utils/aiClients');
    const providers = getProviders();
    const available = getAvailableProviders();

    let insight = null;
    for (const name of available) {
      const provider = providers[name];
      try {
        const response = await provider.client.chat.completions.create({
          model: provider.model,
          messages: [
            { role: 'system', content: 'You generate concise medical data correlations. Return only 1-2 sentences, no preamble.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 100,
        });
        insight = response.choices[0]?.message?.content?.trim() || null;
        if (insight) break;
      } catch (err) {
        const status = err?.status || err?.response?.status;
        if (status === 429 || status === 503) continue;
        throw err;
      }
    }

    if (insight) {
      // Persist to DB — merge new type entry into the JSONB column
      await pool.query(
        `UPDATE patient_profiles
         SET vitals_insights = COALESCE(vitals_insights, '{}'::jsonb) || $1::jsonb
         WHERE patient_id = $2`,
        [JSON.stringify({ [type]: { insight, generated_at: new Date().toISOString() } }), patientId]
      ).catch((e) => console.warn('[patient] Could not persist vitals insight:', e.message));
    }
    return res.json({ insight: insight || null });
  } catch (err) {
    console.error('Vitals insights error:', err);
    return res.status(500).json({ error: 'Failed to generate insight' });
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

// GET /api/patient/sessions — list recent symptom sessions for the logged-in patient
router.get('/sessions', verifyToken, async (req, res) => {
  try {
    const sessions = await getPatientSessions(req.user.userId, 20);
    return res.json({ sessions });
  } catch (err) {
    console.error('Get patient sessions error:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// POST /api/patient/sessions/:id/share
// :id may be a symptom_session id OR a blood_report id
router.post('/sessions/:id/share', verifyToken, async (req, res) => {
  const patientId = req.user.userId;
  const { id } = req.params;

  try {
    let sessionId = null;

    // First: check if it's a symptom session
    const { rows: sessions } = await pool.query(
      'SELECT id FROM symptom_sessions WHERE id = $1 AND patient_id = $2',
      [id, patientId]
    );

    if (sessions.length) {
      sessionId = id;
    } else {
      // Try as a blood_report id — use its session_id if available
      const { rows: reports } = await pool.query(
        'SELECT id, session_id FROM blood_reports WHERE id = $1 AND patient_id = $2',
        [id, patientId]
      );
      if (!reports.length) {
        return res.status(404).json({ error: 'Report not found' });
      }
      sessionId = reports[0].session_id || null;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO report_shares (token, session_id, patient_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [token, sessionId, patientId, expiresAt]
    );

    return res.json({ token, expiresAt });
  } catch (err) {
    console.error('[share] Error:', err);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
});

// GET /api/patient/clinics?lat=<lat>&lng=<lng>&radius=<radius>
router.get('/clinics', verifyToken, async (req, res) => {
  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = parseInt(req.query.radius) || 10000;

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid lat/lng' });
  }

  try {
    const places = await getNearbyDoctors(lat, lng, radius);
    return res.json({ places });
  } catch (err) {
    console.error('[/clinics]', err.message);
    const isCircuit = err.message.includes('circuit open');
    return res.status(503).json({
      error: isCircuit ? 'circuit_open' : 'overpass_failed',
      message: err.message,
    });
  }
});

module.exports = router;
