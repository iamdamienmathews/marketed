// src/routes/leads.js
// Public "quick inquiry" endpoint — for visitors who aren't ready to
// create a full account. Same idea as the original landing page form,
// now writing to the database (leads table) so it shows up in the admin
// CRM instead of a flat JSON file.

const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { sendEmail } = require('../integrations/email/mailer');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submissionLog = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (submissionLog.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  submissionLog.set(ip, timestamps);
  return timestamps.length > MAX_SUBMISSIONS;
}

router.post('/leads', async (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ ok: false, errors: ['Too many submissions. Try again in a few minutes.'] });
  }

  const { name, email, company, phone, budget, message, services, company_website } = req.body;
  const errors = [];
  if (!name || name.trim().length < 2) errors.push('Enter your full name.');
  if (!email || !EMAIL_RE.test(email.trim())) errors.push('Enter a valid email address.');
  if (!message || message.trim().length < 10) errors.push('Tell us a bit more (10+ characters).');
  if (company_website) errors.push('Spam check failed.'); // honeypot
  if (errors.length) return res.status(400).json({ ok: false, errors });

  const id = randomUUID();
  db.prepare(
    `INSERT INTO leads (id, name, email, company, phone, budget, services, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), email.trim().toLowerCase(), company || null, phone || null, budget || null, JSON.stringify(services || []), message.trim());

  const admin = db.prepare(`SELECT email FROM users WHERE role = 'admin' LIMIT 1`).get();
  if (admin) {
    await sendEmail({
      to: admin.email,
      leadId: id,
      subject: `New lead: ${name.trim()}`,
      body: `${name.trim()} <${email.trim()}>\nCompany: ${company || 'n/a'}\nPhone: ${phone || 'n/a'}\nBudget: ${budget || 'n/a'}\n\n${message.trim()}`,
    });
  }

  res.status(201).json({ ok: true, id });
});

module.exports = router;
