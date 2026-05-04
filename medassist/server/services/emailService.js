const nodemailer = require('nodemailer');

/**
 * Render blocks all outbound SMTP (ports 25/465/587) at the firewall — ETIMEDOUT at CONN.
 * Resend HTTP API bypasses this entirely (just HTTPS to api.resend.com).
 * Gmail SMTP fallback is kept for local development only.
 */
async function sendEmail({ to, subject, html }) {
  if (process.env.RESEND_API_KEY) {
    // RESEND_TO_OVERRIDE redirects all mail to a single address (required while using
    // onboarding@resend.dev which can only deliver to the Resend account owner's email)
    const actualTo = process.env.RESEND_TO_OVERRIDE || to;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'MedAssist AI <onboarding@resend.dev>',
        to: [actualTo],
        subject,
        html,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || JSON.stringify(data));
    console.log(`[emailService] Sent via Resend to ${actualTo}: ${data.id}`);
    return data;
  }

  // Local dev only — Gmail SMTP (blocked on Render)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const info = await transporter.sendMail({
      from: `"MedAssist AI" <${process.env.SMTP_USER}>`,
      to, subject, html,
    });
    console.log(`[emailService] Sent via Gmail to ${to}: ${info.messageId}`);
    return info;
  }

  console.log(`[emailService] No provider configured. To: ${to} | Subject: ${subject}`);
  return { dev: true };
}

async function sendAnalysisComplete(email, sessionId) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return sendEmail({
    to: email,
    subject: 'Your MedAssist AI Analysis is Ready',
    html: `
      <h2>Your Blood Report Analysis is Complete</h2>
      <p>Your MedAssist AI analysis for session <strong>${sessionId}</strong> is now ready.</p>
      <p><a href="${clientUrl}/patient/results/${sessionId}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">View Results</a></p>
      <p style="color:#666;font-size:12px;">MedAssist AI &mdash; Your AI Health Assistant</p>
    `,
  });
}

async function sendReportShared(email, shareToken) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return sendEmail({
    to: email,
    subject: 'A Patient Has Shared a Report With You',
    html: `
      <h2>New Shared Report</h2>
      <p>A patient has shared their MedAssist AI report with you.</p>
      <p><a href="${clientUrl}/shared/${shareToken}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">View Report</a></p>
      <p style="color:#666;font-size:12px;">MedAssist AI &mdash; Your AI Health Assistant</p>
    `,
  });
}

async function sendFollowUpReminder(email, patientName, message) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return sendEmail({
    to: email,
    subject: 'MedAssist AI — Blood Test Recheck Reminder',
    html: `
      <h2>Time to Recheck Your Blood Tests</h2>
      <p>Hi ${patientName},</p>
      <p>${message}</p>
      <p>Upload your latest report for an updated AI analysis.</p>
      <p><a href="${clientUrl}/patient/upload-report" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;">Upload Report</a></p>
      <p style="color:#666;font-size:12px;">MedAssist AI &mdash; Your AI Health Assistant</p>
    `,
  });
}

module.exports = { sendEmail, sendAnalysisComplete, sendReportShared, sendFollowUpReminder };
