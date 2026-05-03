const nodemailer = require('nodemailer');

function formatDateTime(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const BRAND = '#0d9488'; // teal-600

function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:${BRAND};padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">MedAssist AI</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px;">Appointment Notification</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">${title}</h2>
          ${body}
          <hr style="margin:28px 0;border:none;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">MedAssist AI — CS 595 Medical Informatics &amp; AI Project</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function row(label, value) {
  return `<tr>
    <td style="padding:6px 0;color:#64748b;font-size:13px;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:600;">${value || '—'}</td>
  </tr>`;
}

async function sendAppointmentEmail({ to, subject, title, body }) {
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'MedAssist AI <onboarding@resend.dev>',
          to: [to],
          subject,
          html: wrapHtml(title, body),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || JSON.stringify(data));
      console.log(`[email] Sent via Resend to ${to}: ${data.id}`);
    } catch (err) {
      console.error('[email] Resend failed:', err.message);
    }
    return;
  }

  // Local dev only — Gmail SMTP (blocked on Render)
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[email] No email provider configured — skipping');
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: `"MedAssist AI" <${process.env.SMTP_USER}>`,
      to, subject, html: wrapHtml(title, body),
    });
    console.log(`[email] Sent to ${to}`);
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
  }
}

async function sendApprovalEmail({ patientEmail, patientName, doctorName, scheduledAt, appointmentId }) {
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Your appointment has been <strong style="color:#16a34a;">approved</strong> by Dr. ${doctorName}.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${row('Doctor', `Dr. ${doctorName}`)}
      ${row('Date &amp; Time', formatDateTime(scheduledAt))}
      ${row('Status', '<span style="color:#16a34a;font-weight:700;">Confirmed</span>')}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">Please arrive 10 minutes early. Contact your doctor if you need to make changes.</p>`;

  return sendAppointmentEmail({
    to: patientEmail,
    subject: `Appointment Confirmed — Dr. ${doctorName}`,
    title: 'Your Appointment is Confirmed',
    body,
  });
}

async function sendRescheduleEmail({ patientEmail, patientName, doctorName, newScheduledAt, doctorNotes }) {
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Dr. ${doctorName} has <strong style="color:#d97706;">rescheduled</strong> your appointment to a new time.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${row('Doctor', `Dr. ${doctorName}`)}
      ${row('New Date &amp; Time', formatDateTime(newScheduledAt))}
      ${doctorNotes ? row('Doctor\'s Note', doctorNotes) : ''}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">If this new time does not work for you, please log in to MedAssist to cancel and re-book.</p>`;

  return sendAppointmentEmail({
    to: patientEmail,
    subject: `Appointment Rescheduled — Dr. ${doctorName}`,
    title: 'Appointment Time Updated',
    body,
  });
}

async function sendCancellationEmail({ patientEmail, patientName, doctorName, scheduledAt, doctorNotes, cancelledBy }) {
  const byDoctor = cancelledBy === 'doctor';
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Your appointment with Dr. ${doctorName} has been <strong style="color:#dc2626;">cancelled</strong>
      ${byDoctor ? 'by the doctor' : 'as requested'}.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${row('Doctor', `Dr. ${doctorName}`)}
      ${scheduledAt ? row('Was Scheduled', formatDateTime(scheduledAt)) : ''}
      ${doctorNotes ? row('Reason', doctorNotes) : ''}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">You can book a new appointment anytime through MedAssist AI.</p>`;

  return sendAppointmentEmail({
    to: patientEmail,
    subject: `Appointment Cancelled — Dr. ${doctorName}`,
    title: 'Appointment Cancelled',
    body,
  });
}

async function sendDeclineEmail({ patientEmail, patientName, doctorName, doctorNotes }) {
  const body = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Dr. ${doctorName} was unable to accept your appointment request.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      ${row('Patient', patientName)}
      ${row('Doctor', `Dr. ${doctorName}`)}
      ${doctorNotes ? row('Reason', doctorNotes) : ''}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">Please try booking with another doctor or at a different time.</p>`;

  return sendAppointmentEmail({
    to: patientEmail,
    subject: `Appointment Request Declined — Dr. ${doctorName}`,
    title: 'Appointment Not Available',
    body,
  });
}

module.exports = { sendApprovalEmail, sendRescheduleEmail, sendCancellationEmail, sendDeclineEmail };
