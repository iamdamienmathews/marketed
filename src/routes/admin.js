// src/routes/admin.js
// Everything the agency owner needs: client list + detail, assigning
// services after a discovery call, adding a channel + API key (the "just
// add an API key to a field" flow), the leads pipeline, and sending
// emails to any client or lead.

const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { encrypt } = require('../utils/crypto');
const { sendEmail } = require('../integrations/email/mailer');
const { syncChannel } = require('../integrations/channels/sync');

const router = express.Router();
router.use(requireAdmin);

// ---- clients ----

router.get('/clients', (req, res) => {
  const clients = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.company, u.phone, u.created_at,
        (SELECT COUNT(*) FROM client_services cs WHERE cs.client_id = u.id AND cs.status = 'active') AS active_services,
        (SELECT COUNT(*) FROM bookings b WHERE b.client_id = u.id AND b.status = 'scheduled') AS upcoming_bookings
       FROM users u WHERE u.role = 'client' ORDER BY u.created_at DESC`
    )
    .all();
  res.json({ ok: true, clients });
});

router.get('/clients/:id', (req, res) => {
  const client = db.prepare(`SELECT id, name, email, company, phone, created_at FROM users WHERE id = ? AND role = 'client'`).get(req.params.id);
  if (!client) return res.status(404).json({ ok: false, errors: ['Client not found.'] });

  const interests = db.prepare(`SELECT * FROM interests WHERE client_id = ? ORDER BY created_at DESC`).all(client.id);
  const services = db.prepare(`SELECT * FROM client_services WHERE client_id = ? ORDER BY started_at DESC`).all(client.id);
  const channels = db
    .prepare(`SELECT id, channel_type, label, status, last_error, last_synced_at, created_at FROM client_channels WHERE client_id = ?`)
    .all(client.id); // note: credentials_encrypted intentionally excluded from the response
  const bookings = db.prepare(`SELECT * FROM bookings WHERE client_id = ? ORDER BY start_time DESC`).all(client.id);
  const messages = db.prepare(`SELECT * FROM messages WHERE client_id = ? ORDER BY sent_at DESC`).all(client.id);
  const cancellations = db.prepare(`SELECT * FROM cancellation_requests WHERE client_id = ? ORDER BY created_at DESC`).all(client.id);

  res.json({ ok: true, client, interests, services, channels, bookings, messages, cancellations });
});

// ---- services (assigning what a client subscribes to, post-call) ----

router.post('/clients/:id/services', (req, res) => {
  const { service_key, price_note } = req.body;
  const service = db.prepare('SELECT * FROM services WHERE key = ?').get(service_key);
  if (!service) return res.status(400).json({ ok: false, errors: ['Unknown service.'] });

  const id = randomUUID();
  db.prepare(
    `INSERT INTO client_services (id, client_id, service_key, status, price_note) VALUES (?, ?, ?, 'active', ?)`
  ).run(id, req.params.id, service_key, price_note || service.price_note);

  res.status(201).json({ ok: true, id });
});

router.patch('/clients/:id/services/:serviceId', (req, res) => {
  const { status, price_note } = req.body;
  const updates = [];
  const values = [];
  if (status) { updates.push('status = ?'); values.push(status); if (status === 'cancelled') { updates.push("cancelled_at = datetime('now')"); } }
  if (price_note) { updates.push('price_note = ?'); values.push(price_note); }
  if (!updates.length) return res.status(400).json({ ok: false, errors: ['Nothing to update.'] });

  values.push(req.params.serviceId);
  db.prepare(`UPDATE client_services SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// ---- channels (the "add an API key" integration flow) ----

router.post('/clients/:id/channels', async (req, res) => {
  const { channel_type, label, credentials } = req.body;
  if (!channel_type || !credentials) {
    return res.status(400).json({ ok: false, errors: ['channel_type and credentials are required.'] });
  }

  const id = randomUUID();
  let encrypted;
  try {
    encrypted = encrypt(credentials);
  } catch (err) {
    return res.status(500).json({ ok: false, errors: [err.message] });
  }

  db.prepare(
    `INSERT INTO client_channels (id, client_id, channel_type, label, credentials_encrypted, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(id, req.params.id, channel_type, label || channel_type, encrypted);

  // Try an immediate sync so the dashboard populates right away instead
  // of waiting for the next scheduled poll.
  const channel = db.prepare('SELECT * FROM client_channels WHERE id = ?').get(id);
  await syncChannel(channel);

  const refreshed = db.prepare('SELECT id, channel_type, label, status, last_error FROM client_channels WHERE id = ?').get(id);
  res.status(201).json({ ok: true, channel: refreshed });
});

router.patch('/clients/:id/channels/:channelId', async (req, res) => {
  const { label, credentials, status } = req.body;
  if (label) db.prepare('UPDATE client_channels SET label = ? WHERE id = ?').run(label, req.params.channelId);
  if (status) db.prepare('UPDATE client_channels SET status = ? WHERE id = ?').run(status, req.params.channelId);
  if (credentials) {
    const encrypted = encrypt(credentials);
    db.prepare('UPDATE client_channels SET credentials_encrypted = ?, status = ? WHERE id = ?').run(encrypted, 'pending', req.params.channelId);
    const channel = db.prepare('SELECT * FROM client_channels WHERE id = ?').get(req.params.channelId);
    await syncChannel(channel);
  }
  res.json({ ok: true });
});

router.delete('/clients/:id/channels/:channelId', (req, res) => {
  db.prepare('DELETE FROM metrics WHERE client_channel_id = ?').run(req.params.channelId);
  db.prepare('DELETE FROM client_channels WHERE id = ?').run(req.params.channelId);
  res.json({ ok: true });
});

// ---- leads ----

router.get('/leads', (req, res) => {
  const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  res.json({ ok: true, leads: leads.map((l) => ({ ...l, services: JSON.parse(l.services || '[]') })) });
});

router.patch('/leads/:id', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ ok: false, errors: ['status is required.'] });
  db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// ---- messaging (CRM email, to a client or a lead) ----

router.post('/messages', async (req, res) => {
  const { to, subject, body, clientId, leadId } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ ok: false, errors: ['to, subject, and body are required.'] });

  await sendEmail({ to, subject, body, clientId, leadId, sentByAdminId: req.session.userId });
  res.status(201).json({ ok: true });
});

// ---- cancellation requests ----

router.get('/cancellations', (req, res) => {
  const rows = db
    .prepare(
      `SELECT cr.*, u.name AS client_name, u.email AS client_email, cs.service_key
       FROM cancellation_requests cr
       JOIN users u ON u.id = cr.client_id
       JOIN client_services cs ON cs.id = cr.client_service_id
       ORDER BY cr.created_at DESC`
    )
    .all();
  res.json({ ok: true, cancellations: rows });
});

router.patch('/cancellations/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE cancellation_requests SET status = ? WHERE id = ?').run(status || 'resolved', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
