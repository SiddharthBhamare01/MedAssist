const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const pool = require('../db/pool');
const auditLog = require('../middleware/audit');
const {
  sendApprovalEmail,
  sendRescheduleEmail,
  sendCancellationEmail,
  sendDeclineEmail,
} = require('../services/email');

const CANCEL_HOURS = 24; // patient cannot cancel within this many hours of scheduled_at

function canPatientCancel(scheduledAt) {
  if (!scheduledAt) return true; // no time set yet (still pending) — allow cancel
  const diffMs = new Date(scheduledAt) - Date.now();
  return diffMs > CANCEL_HOURS * 60 * 60 * 1000;
}

// GET /api/appointments/doctors — list registered doctors for patient dropdown
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

// POST /api/appointments — patient books an appointment
router.post('/', verifyToken, auditLog('create', 'appointment'), async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Only patients can create appointments' });
  }

  const { doctor_id, scheduled_at, notes } = req.body;
  if (!doctor_id) return res.status(400).json({ error: 'doctor_id is required' });

  try {
    const { rows: docRows } = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'doctor'",
      [doctor_id]
    );
    if (!docRows.length) return res.status(404).json({ error: 'Doctor not found' });

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

// GET /api/appointments — list appointments for the current user
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, view } = req.query;
    const params = [req.user.userId];

    let query;
    if (req.user.role === 'doctor') {
      query = `SELECT a.*,
                      u.full_name AS patient_name, u.email AS patient_email
               FROM appointments a
               JOIN users u ON u.id = a.patient_id
               WHERE a.doctor_id = $1`;
    } else {
      query = `SELECT a.*,
                      u.full_name AS doctor_name, u.email AS doctor_email,
                      dp.specialization, dp.hospital_name, dp.city
               FROM appointments a
               JOIN users u ON u.id = a.doctor_id
               LEFT JOIN doctor_profiles dp ON dp.user_id = a.doctor_id
               WHERE a.patient_id = $1`;
    }

    if (status) {
      params.push(status);
      query += ` AND a.status = $${params.length}`;
    }

    // Calendar range filter for doctor calendar view
    if (view === 'day' && req.query.date) {
      params.push(req.query.date);
      query += ` AND DATE(a.scheduled_at) = $${params.length}`;
    } else if (view === 'week' && req.query.start && req.query.end) {
      params.push(req.query.start, req.query.end);
      query += ` AND a.scheduled_at >= $${params.length - 1} AND a.scheduled_at < $${params.length}`;
    } else if (view === 'month' && req.query.year && req.query.month) {
      params.push(req.query.year, req.query.month);
      query += ` AND EXTRACT(YEAR FROM a.scheduled_at) = $${params.length - 1}
                 AND EXTRACT(MONTH FROM a.scheduled_at) = $${params.length}`;
    }

    query += ' ORDER BY a.requested_at DESC LIMIT 200';

    const { rows } = await pool.query(query, params);
    res.json({ appointments: rows });
  } catch (err) {
    console.error('List appointments error:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/appointments/:id — single appointment detail
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*,
              p.full_name AS patient_name, p.email AS patient_email,
              d.full_name AS doctor_name, d.email AS doctor_email,
              dp.specialization, dp.hospital_name, dp.city
       FROM appointments a
       JOIN users p ON p.id = a.patient_id
       JOIN users d ON d.id = a.doctor_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = a.doctor_id
       WHERE a.id = $1 AND (a.patient_id = $2 OR a.doctor_id = $2)`,
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ appointment: rows[0] });
  } catch (err) {
    console.error('Get appointment error:', err);
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// PUT /api/appointments/:id — update appointment (doctor or patient)
router.put('/:id', verifyToken, auditLog('update', 'appointment'), async (req, res) => {
  const { status, scheduled_at, notes, doctor_notes } = req.body;
  const isDoctor = req.user.role === 'doctor';

  try {
    // Fetch appointment with user details for email
    const { rows: existing } = await pool.query(
      `SELECT a.*,
              p.full_name AS patient_name, p.email AS patient_email,
              d.full_name AS doctor_name, d.email AS doctor_email
       FROM appointments a
       JOIN users p ON p.id = a.patient_id
       JOIN users d ON d.id = a.doctor_id
       WHERE a.id = $1 AND (a.doctor_id = $2 OR a.patient_id = $2)`,
      [req.params.id, req.user.userId]
    );

    if (!existing.length) return res.status(404).json({ error: 'Appointment not found' });
    const apt = existing[0];

    // ── Patient logic ────────────────────────────────────────────────────
    if (!isDoctor) {
      // Patient can only edit their own appointment
      if (apt.patient_id !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (status === 'cancelled') {
        // Enforce 24-hour cancellation restriction
        if (!canPatientCancel(apt.scheduled_at)) {
          const hoursLeft = Math.round((new Date(apt.scheduled_at) - Date.now()) / 3600000);
          return res.status(400).json({
            error: `You cannot cancel within ${CANCEL_HOURS} hours of the appointment. Your appointment is in ${hoursLeft} hour(s).`,
            code: 'CANCEL_TOO_LATE',
          });
        }

        const { rows } = await pool.query(
          `UPDATE appointments
           SET status = 'cancelled', cancelled_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [apt.id]
        );
        return res.json({ appointment: rows[0] });
      }

      // Patient editing notes/time of a pending appointment
      if (!['pending'].includes(apt.status)) {
        return res.status(400).json({ error: 'You can only edit pending appointments' });
      }

      const fields = [];
      const params = [apt.id];
      if (notes !== undefined) { params.push(notes); fields.push(`notes = $${params.length}`); }
      if (scheduled_at) { params.push(scheduled_at); fields.push(`scheduled_at = $${params.length}`); }

      if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

      const { rows } = await pool.query(
        `UPDATE appointments SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );
      return res.json({ appointment: rows[0] });
    }

    // ── Doctor logic ─────────────────────────────────────────────────────
    if (apt.doctor_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const DOCTOR_VALID = ['accepted', 'declined', 'cancelled', 'completed', 'rescheduled'];
    if (status && !DOCTOR_VALID.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${DOCTOR_VALID.join(', ')}` });
    }

    const fields = [];
    const params = [apt.id];

    if (status) {
      params.push(status);
      fields.push(`status = $${params.length}`);
      if (status === 'cancelled') {
        fields.push('cancelled_at = NOW()');
      }
    }
    if (scheduled_at) {
      params.push(scheduled_at);
      fields.push(`scheduled_at = $${params.length}`);
      fields.push('doctor_proposed_at = NOW()');
    }
    if (doctor_notes !== undefined) {
      params.push(doctor_notes);
      fields.push(`doctor_notes = $${params.length}`);
    }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    const { rows } = await pool.query(
      `UPDATE appointments SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    const updated = rows[0];

    // ── Send email notifications ──────────────────────────────────────
    const emailData = {
      patientEmail: apt.patient_email,
      patientName:  apt.patient_name,
      doctorName:   apt.doctor_name,
      scheduledAt:  updated.scheduled_at || apt.scheduled_at,
      doctorNotes:  doctor_notes,
    };

    if (status === 'accepted') {
      sendApprovalEmail(emailData).catch(() => {});
    } else if (status === 'declined') {
      sendDeclineEmail(emailData).catch(() => {});
    } else if (status === 'cancelled') {
      sendCancellationEmail({ ...emailData, cancelledBy: 'doctor' }).catch(() => {});
    } else if (status === 'rescheduled' || (!status && scheduled_at)) {
      sendRescheduleEmail({ ...emailData, newScheduledAt: updated.scheduled_at }).catch(() => {});
    }

    res.json({ appointment: updated });
  } catch (err) {
    console.error('Update appointment error:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

module.exports = router;
