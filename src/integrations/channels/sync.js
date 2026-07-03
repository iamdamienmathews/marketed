// src/integrations/channels/sync.js
// The polling engine behind "real-time" dashboards. True push-based
// real-time would mean each ad platform calling us on every event, which
// none of them support for arbitrary third parties — so the honest,
// standard approach (used by virtually every marketing dashboard product)
// is: poll each connected channel on an interval, store each reading as a
// timestamped row, and push the latest values to open dashboards over
// Server-Sent Events (see routes/metrics.js). To the client this feels
// live; under the hood it's a poll-and-broadcast loop.

const cron = require('node-cron');
const { randomUUID } = require('crypto');
const db = require('../../db');
const { decrypt } = require('../../utils/crypto');

const adapters = {
  google_ads: require('./adapters/googleAds'),
  meta_ads: require('./adapters/metaAds'),
  klaviyo: require('./adapters/klaviyo'),
  semrush: require('./adapters/semrush'),
  adroll: require('./adapters/adroll'),
  webhook: require('./adapters/webhook'),
};

// Subscribers for SSE streams, keyed by client_id.
const subscribers = new Map(); // client_id -> Set<res>

function subscribe(clientId, res) {
  if (!subscribers.has(clientId)) subscribers.set(clientId, new Set());
  subscribers.get(clientId).add(res);
}

function unsubscribe(clientId, res) {
  subscribers.get(clientId)?.delete(res);
}

function broadcast(clientId, payload) {
  const set = subscribers.get(clientId);
  if (!set) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(line);
}

async function syncChannel(channel) {
  const adapter = adapters[channel.channel_type];
  if (!adapter) {
    db.prepare(`UPDATE client_channels SET status = 'error', last_error = ? WHERE id = ?`)
      .run(`No adapter registered for "${channel.channel_type}"`, channel.id);
    return;
  }

  try {
    const credentials = decrypt(channel.credentials_encrypted);
    const metrics = await adapter.fetchMetrics(credentials);

    const insert = db.prepare(
      `INSERT INTO metrics (id, client_channel_id, metric_key, metric_value) VALUES (?, ?, ?, ?)`
    );
    for (const [key, value] of Object.entries(metrics)) {
      insert.run(randomUUID(), channel.id, key, value);
    }

    db.prepare(
      `UPDATE client_channels SET status = 'connected', last_error = NULL, last_synced_at = datetime('now') WHERE id = ?`
    ).run(channel.id);

    broadcast(channel.client_id, { channelId: channel.id, channelType: channel.channel_type, metrics, syncedAt: new Date().toISOString() });
  } catch (err) {
    db.prepare(`UPDATE client_channels SET status = 'error', last_error = ? WHERE id = ?`)
      .run(err.message, channel.id);
    broadcast(channel.client_id, { channelId: channel.id, error: err.message });
  }
}

async function syncAllChannels() {
  const channels = db.prepare(`SELECT * FROM client_channels WHERE status != 'pending' OR credentials_encrypted IS NOT NULL`).all();
  for (const channel of channels) {
    await syncChannel(channel);
  }
}

function startScheduler() {
  const cronExpr = process.env.SYNC_CRON || '*/5 * * * *'; // every 5 minutes by default
  cron.schedule(cronExpr, () => {
    syncAllChannels().catch((err) => console.error('Channel sync run failed:', err));
  });
  console.log(`Channel sync scheduled: "${cronExpr}"`);
}

module.exports = { subscribe, unsubscribe, syncChannel, syncAllChannels, startScheduler, adapters };
