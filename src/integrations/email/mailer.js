// src/integrations/email/mailer.js
// Sends real email via SMTP (works with Gmail, SendGrid, Postmark,
// Mailgun, or any SMTP provider) once SMTP_* env vars are set. Without
// them, it logs to the console and to the messages table instead of
// throwing — so signup/booking/CRM flows are fully testable before you
// have an email provider connected.

const nodemailer = require('nodemailer');
const { randomUUID } = require('crypto');
const db = require('../../db');

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// Every email sent through the platform is logged to `messages`, whether
// or not SMTP is configured — this is what powers the CRM's "email
// history" per client.
async function sendEmail({ to, subject, body, clientId, leadId, sentByAdminId }) {
  if (isConfigured()) {
    const transport = getTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: body,
    });
  } else {
    console.log(`[email:not-configured] Would send to ${to} — "${subject}"`);
  }

  db.prepare(
    `INSERT INTO messages (id, client_id, lead_id, to_email, subject, body, sent_by_admin_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), clientId || null, leadId || null, to, subject, body, sentByAdminId || null);
}

module.exports = { isConfigured, sendEmail };
