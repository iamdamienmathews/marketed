// src/integrations/calendar/google.js
// Real Google Calendar integration using the official googleapis SDK.
// Requires a Google Cloud project with the Calendar API enabled and an
// OAuth 2.0 Client ID (Web application) — see README "Google Calendar
// setup" section. Until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set,
// isConfigured() returns false and callers fall back to the .ics file
// (see routes/bookings.js), so the booking flow works either way.

const { google } = require('googleapis');
const db = require('../../db');

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.BASE_URL || 'http://localhost:3000'}/api/calendar/google/callback`
  );
}

// Step 1: send the user here to grant calendar access.
function getAuthUrl(userId) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: userId, // so the callback knows whose tokens these are
  });
}

// Step 2: exchange the code Google redirects back with for tokens, and
// store them against the user (client or admin — both can connect).
async function handleOAuthCallback(code, userId) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  db.prepare(
    `CREATE TABLE IF NOT EXISTS google_tokens (
      user_id TEXT PRIMARY KEY,
      refresh_token TEXT,
      access_token TEXT,
      expiry_date INTEGER
    )`
  ).run();
  db.prepare(
    `INSERT INTO google_tokens (user_id, refresh_token, access_token, expiry_date)
     VALUES (@user_id, @refresh_token, @access_token, @expiry_date)
     ON CONFLICT(user_id) DO UPDATE SET
       refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
       access_token = excluded.access_token,
       expiry_date = excluded.expiry_date`
  ).run({
    user_id: userId,
    refresh_token: tokens.refresh_token || null,
    access_token: tokens.access_token || null,
    expiry_date: tokens.expiry_date || null,
  });
}

function getStoredTokens(userId) {
  const row = db
    .prepare(`SELECT * FROM google_tokens WHERE user_id = ?`)
    .get(userId);
  return row || null;
}

// Creates a real Google Calendar event (with a Google Meet link attached)
// on behalf of a connected user. Returns { eventId, meetLink } or null if
// that user hasn't connected Google Calendar.
async function createEventWithMeet({ userId, summary, description, startISO, endISO, attendeeEmails }) {
  const tokens = getStoredTokens(userId);
  if (!isConfigured() || !tokens) return null;

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: tokens.refresh_token, access_token: tokens.access_token });

  const calendar = google.calendar({ version: 'v3', auth: client });
  const response = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary,
      description,
      start: { dateTime: startISO },
      end: { dateTime: endISO },
      attendees: attendeeEmails.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: `vantage-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });

  const meetLink = response.data.hangoutLink || null;
  return { eventId: response.data.id, meetLink };
}

module.exports = { isConfigured, getAuthUrl, handleOAuthCallback, getStoredTokens, createEventWithMeet };
