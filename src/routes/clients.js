// src/routes/clients.js
// A logged-in client's view of their own account: active services,
// connected channels (metadata only — never credentials), message
// history, and the ability to request a cancellation.

const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendEmail } = require('../integrations/email/mailer');

const router = express.Router();

router.get('/clients/me/services', requireAuth, (req, res) => {
  const services = db
    .prepare(
      `SELECT cs.*, s.name AS service_name, s.description
       FROM client_services cs JOIN services s ON s.key = cs.service_key
       WHERE cs.client_id = ? ORDER BY cs.started_at DESC`
    )
    .all(req.session.userId);
  res.json({ ok: true, services });
});

router.get('/clients/me/channels', requireAuth, (req, res) => {
  const channels = db
    .prepare(`SELECT id, channel_type, label, status, last_synced_at FROM client_channels WHERE client_id = ?`)
    .all(req.session.userId);
  res.json({ ok: true, channels });
});

router.get('/clients/me/messages', requireAuth, (req, res) => {
  const messages = db.prepare('SELECT * FROM messages WHERE client_id = ? ORDER BY sent_at DESC').all(req.session.userId);
  res.json({ ok: true, messages });
});

// Client-initiated cancellation request — does not cancel immediately;
// it flags the admin, who resolves it (matching "easy cancellation
// through direct requests on the platform or through a discovery call").
router.post('/clients/me/services/:id/cancel', requireAuth, async (req, res) => {
  const { reason } = req.body;
  const clientService = db
    .prepare('SELECT * FROM client_services WHERE id = ? AND client_id = ?')
    .get(req.params.id, req.session.userId);
  if (!clientService) return res.status(404).json({ ok: false, errors: ['Service not found on your account.'] });

  const id = randomUUID();
  db.prepare(
    `INSERT INTO cancellation_requests (id, client_service_id, client_id, reason) VALUES (?, ?, ?, ?)`
  ).run(id, clientService.id, req.session.userId, reason || null);

  const admin = db.prepare(`SELECT email FROM users WHERE role = 'admin' LIMIT 1`).get();
  const client = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.session.userId);
  if (admin) {
    await sendEmail({
      to: admin.email,
      subject: `Cancellation request from ${client.name}`,
      body: `${client.name} (${client.email}) requested to cancel "${clientService.service_key}".\nReason: ${reason || 'none given'}`,
    });
  }

  res.status(201).json({ ok: true, id });
});

module.exports = router;
