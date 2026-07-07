// src/routes/auth.js
// Signup / login / logout. Sessions are stored server-side (connect-sqlite3)
// with a long-lived cookie (30 days, sliding) — this is what makes
// "returning users don't need to log in every time" work: the session
// persists in the browser cookie and on the server until it expires or
// they explicitly log out.

const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const db = require('../db');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', async (req, res) => {
  const { name, email, password, company, phone, agreedToTerms } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2) errors.push('Enter your full name.');
  if (!email || !EMAIL_RE.test(email.trim())) errors.push('Enter a valid email address.');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  if (!agreedToTerms) errors.push('You must agree to the Terms of Service and Privacy Policy to create an account.');
  if (errors.length) return res.status(400).json({ ok: false, errors });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) return res.status(409).json({ ok: false, errors: ['An account with this email already exists.'] });

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);

  db.prepare(
    `INSERT INTO users (id, role, name, email, password_hash, company, phone, terms_accepted_at)
     VALUES (?, 'client', ?, ?, ?, ?, ?, datetime('now'))`
  ).run(id, name.trim(), email.trim().toLowerCase(), passwordHash, company || null, phone || null);

  req.session.userId = id;
  req.session.role = 'client';

  res.status(201).json({ ok: true, user: { id, name: name.trim(), email: email.trim().toLowerCase(), role: 'client' } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, errors: ['Enter your email and password.'] });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) return res.status(401).json({ ok: false, errors: ['Incorrect email or password.'] });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ ok: false, errors: ['Incorrect email or password.'] });

  req.session.userId = user.id;
  req.session.role = user.role;

  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// Used by every page on load to silently check "am I still logged in?"
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.json({ ok: true, user: null });
  const user = db.prepare('SELECT id, name, email, role, company, phone FROM users WHERE id = ?').get(req.session.userId);
  res.json({ ok: true, user: user || null });
});

module.exports = router;
