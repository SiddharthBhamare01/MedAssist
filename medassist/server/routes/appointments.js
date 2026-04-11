const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const pool = require('../db/pool');
const auditLog = require('../middleware/audit');

// GET /api/appointments/doctors — list available doctors for patient dropdown
router.get('/doctors', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name,
              dp.specialization, dp.hospital_name, dp.city, dp.state, dp.phone, dp.available
       FROM users u
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       WHERE u.role = 'doctor'
       ORDER BY u.full_name`
    );
    res.json({ doctors: rows });
  } catch (err) {
    console.error('List doctors error:', err);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// POST /api/appointments — patient requests appointment
router.post('/', verifyToken, auditLog('create', 'appointment'), async (req, res) => {
  const { doctor_id, scheduled_at, notes } = req.body;

  if (!doctor_id) {
    return res.status(400).json({ error: 'doctor_id is required' });
  }

  try {
    // Verify doctor exists
    const { rows: docRows } = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'doctor'",
      [doctor_id]
    );
    if (!docRows.length) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, notes, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [req.user.userId, doctor_id, scheduled_at || null, notes || null]
    );

    res.status(201).json({ appointment: rows[0] });
  } catch (err) {
    console.error('Create appointment error:', err);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// GET /api/appointments — list appointments (both roles)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;

    let query;
    const params = [req.user.userId, parseInt(limit)];

    if (req.user.role === 'doctor') {
      query = `SELECT a.*, u.full_name AS patient_name, u.email AS patient_email
               FROM appointments a
               JOIN users u ON u.id = a.patient_id
               WHERE a.doctor_id = $1`;
    } else {
      query = `SELECT a.*, u.full_name AS doctor_name, u.email AS doctor_email
               FROM appointments a
               JOIN users u ON u.id = a.doctor_id
               WHERE a.patient_id = $1`;
    }

    if (status) {
      params.push(status);
      query += ` AND a.status = $${params.length}`;
    }

    query += ` ORDER BY a.requested_at DESC LIMIT $2`;

    const { rows } = await pool.query(query, params);
    res.json({ appointments: rows });
  } catch (err) {
    console.error('List appointments error:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// PUT /api/appointments/:id — update appointment (accept/decline/reschedule)
router.put('/:id', verifyToken, auditLog('update', 'appointment'), async (req, res) => {
  const { status, scheduled_at, notes } = req.body;

  if (!status || !['accepted', 'declined', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Valid status is required (accepted, declined, cancelled, completed)' });
  }

  try {
    // Verify the appointment belongs to this user (doctor or patient)
    const { rows: existing } = await pool.query(
      'SELECT * FROM appointments WHERE id = $1 AND (doctor_id = $2 OR patient_id = $2)',
      [req.params.id, req.user.userId]
    );

    if (!existing.length) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const updateFields = ['status = $2'];
    const params = [req.params.id, status];

    if (scheduled_at) {
      params.push(scheduled_at);
      updateFields.push(`scheduled_at = $${params.length}`);
    }
    if (notes) {
      params.push(notes);
      updateFields.push(`notes = $${params.length}`);
    }

    const { rows } = await pool.query(
      `UPDATE appointments SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    res.json({ appointment: rows[0] });
  } catch (err) {
    console.error('Update appointment error:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

module.exports = router;
