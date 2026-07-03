// src/integrations/meeting/zoom.js
// Creates a real Zoom meeting via the Zoom REST API using a
// Server-to-Server OAuth app (the modern replacement for JWT apps —
// set up in the Zoom App Marketplace, see README "Zoom setup").
// Uses Node's built-in fetch (Node 18+), no extra dependency needed.

function isConfigured() {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET
  );
}

async function getAccessToken() {
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` } }
  );
  if (!res.ok) throw new Error(`Zoom auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// Returns { joinUrl } or null if Zoom isn't configured — callers should
// fall back to a manual link or Google Meet in that case.
async function createMeeting({ topic, startISO, durationMinutes, hostEmail }) {
  if (!isConfigured()) return null;

  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/users/${hostEmail}/meetings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic,
      type: 2, // scheduled meeting
      start_time: startISO,
      duration: durationMinutes,
      settings: { join_before_host: false, waiting_room: true },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zoom meeting creation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return { joinUrl: data.join_url, meetingId: data.id };
}

module.exports = { isConfigured, createMeeting };
