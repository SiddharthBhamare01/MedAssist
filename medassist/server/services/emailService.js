const nodemailer = require('nodemailer');
const { resolve4 } = require('dns').promises;

/**
 * Creates a nodemailer transporter using an explicitly-resolved IPv4 address.
 * Render's DNS resolves smtp.gmail.com to IPv6 which it can't route outbound.
 * dns.resolve4() asks only for A records, bypassing the OS IPv6 preference.
 */
async function createTransporter() {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpSecure = process.env.SMTP_SECURE === 'true';

  let host = smtpHost;
  try {
    const [ipv4] = await resolve4(smtpHost);
    host = ipv4; // connect via IPv4 address directly
    console.log(`[emailService] Resolved ${smtpHost} → ${host}`);
  } catch {
    // fallback to hostname if DNS lookup fails
  }

  return nodemailer.createTransport({
    host,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      servername: smtpHost,       // original hostname for TLS certificate validation
      rejectUnauthorized: false,
    },
  });
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[emailService] DEV — no SMTP configured. To: ${to} | Subject: ${subject}`);
    return { dev: true };
  }

  const transporter = await createTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || `"MedAssist AI" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
  console.log(`[emailService] Email sent to ${to}: ${info.messageId}`);
  return info;
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
