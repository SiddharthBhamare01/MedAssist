const nodemailer = require('nodemailer');

// If SMTP creds are configured, use real transporter; otherwise log to console
const isConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send an email. Falls back to console.log in dev mode.
 */
async function sendEmail({ to, subject, html }) {
  if (!transporter) {
    console.log('[emailService] DEV MODE — email not sent:');
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${html}`);
    return { dev: true };
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || `"MedAssist AI" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
  console.log(`[emailService] Email sent to ${to}: ${info.messageId}`);
  return info;
}

/**
 * Notify patient that blood report analysis is complete.
 */
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

/**
 * Notify a doctor that a report has been shared with them.
 */
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

module.exports = { sendEmail, sendAnalysisComplete, sendReportShared };
