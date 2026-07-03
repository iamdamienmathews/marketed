// src/routes/services.js
// Public service catalog + the "register interest" flow that decides
// whether a client can self-serve (simple services) or must book a
// discovery call first (complex services).

const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/services', (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY complexity, name').all();
  res.json({ ok: true, services });
});

// POST /api/interests — client registers interest in a service.
// Simple services: recorded as 'pending' — admin can approve directly,
// no call needed. Complex services: recorded as 'needs_call' and the
// response tells the frontend to route the client into booking.
router.post('/interests', requireAuth, (req, res) => {
  const { service_key, note } = req.body;
  const service = db.prepare('SELECT * FROM services WHERE key = ?').get(service_key);
  if (!service) return res.status(400).json({ ok: false, errors: ['Unknown service.'] });

  const status = service.complexity === 'complex' ? 'needs_call' : 'pending';
  const id = randomUUID();

  db.prepare(
    `INSERT INTO interests (id, client_id, service_key, note, status) VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.session.userId, service_key, note || null, status);

  res.status(201).json({
    ok: true,
    interest: { id, service_key, status },
    requiresDiscoveryCall: status === 'needs_call',
  });
});

router.get('/interests/mine', requireAuth, (req, res) => {
  const interests = db
    .prepare(
      `SELECT i.*, s.name AS service_name, s.complexity
       FROM interests i JOIN services s ON s.key = i.service_key
       WHERE i.client_id = ? ORDER BY i.created_at DESC`
    )
    .all(req.session.userId);
  res.json({ ok: true, interests });
});

module.exports = router;
