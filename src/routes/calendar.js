// src/routes/calendar.js
// Lets either a client or the admin connect their own Google Calendar.
// In practice you'll mainly use this from the admin dashboard (so the
// discovery-call event + Meet link is created on the agency's calendar),
// but the same flow works for any logged-in user.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const google = require('../integrations/calendar/google');

const db = require('../db');
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS google_tokens (
      user_id TEXT PRIMARY KEY,
      refresh_token TEXT,
      access_token TEXT,
      expiry_date INTEGER
    )
  `).run();
} catch (e) { console.error("Database initialization failed:", e); }

const router = express.Router();

router.get('/calendar/google/status', requireAuth, (req, res) => {
  res.json({
    ok: true,
    configured: google.isConfigured(),
    connected: Boolean(google.getStoredTokens(req.session.userId)),
  });
});

router.get('/calendar/google/connect', requireAuth, (req, res) => {
  if (!google.isConfigured()) {
    return res.status(400).json({
      ok: false,
      errors: ['Google Calendar is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.'],
    });
  }
  res.redirect(google.getAuthUrl(req.session.userId));
});

router.get('/calendar/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state.');
  try {
    await google.handleOAuthCallback(code, state);
    res.redirect('/admin/index.html?google_connected=1');
  } catch (err) {
    console.error('Google OAuth callback failed:', err);
    res.status(500).send('Failed to connect Google Calendar.');
  }
});

module.exports = router;
