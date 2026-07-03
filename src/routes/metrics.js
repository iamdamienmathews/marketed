// src/routes/metrics.js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { subscribe, unsubscribe, syncChannel } = require('../integrations/channels/sync');

const router = express.Router();

function resolveClientId(req) {
  // Admins can view any client's stream via ?clientId=, clients only their own.
  if (req.session.role === 'admin' && req.query.clientId) return req.query.clientId;
  return req.session.userId;
}

// Server-Sent Events stream — the frontend opens this once and receives
// a push every time a channel finishes syncing (see sync.js broadcast()).
router.get('/metrics/stream', requireAuth, (req, res) => {
  const clientId = resolveClientId(req);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 5000\n\n');

  subscribe(clientId, res);

  req.on('close', () => unsubscribe(clientId, res));
});

// Latest snapshot per channel — used to paint the dashboard on first
// load, before any SSE push has happened yet.
router.get('/metrics/latest', requireAuth, (req, res) => {
  const clientId = resolveClientId(req);

  const channels = db.prepare('SELECT * FROM client_channels WHERE client_id = ?').all(clientId);
  const result = channels.map((channel) => {
    const latest = db
      .prepare(
        `SELECT metric_key, metric_value, MAX(recorded_at) AS recorded_at
         FROM metrics WHERE client_channel_id = ? GROUP BY metric_key`
      )
      .all(channel.id);
    return {
      channelId: channel.id,
      channelType: channel.channel_type,
      label: channel.label,
      status: channel.status,
      lastError: channel.last_error,
      lastSyncedAt: channel.last_synced_at,
      metrics: Object.fromEntries(latest.map((m) => [m.metric_key, m.metric_value])),
    };
  });

  res.json({ ok: true, channels: result });
});

// Manual "sync now" button — admin or client can trigger an on-demand
// refresh instead of waiting for the next scheduled poll.
router.post('/metrics/:channelId/sync-now', requireAuth, async (req, res) => {
  const channel = db.prepare('SELECT * FROM client_channels WHERE id = ?').get(req.params.channelId);
  if (!channel) return res.status(404).json({ ok: false, errors: ['Channel not found.'] });
  if (req.session.role !== 'admin' && channel.client_id !== req.session.userId) {
    return res.status(403).json({ ok: false, errors: ['Not your channel.'] });
  }
  await syncChannel(channel);
  res.json({ ok: true });
});

module.exports = router;
