// src/routes/bookings.js
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getAvailableSlots } = require('../utils/slots');
const { generateICS } = require('../integrations/calendar/ics');
const google = require('../integrations/calendar/google');
const zoom = require('../integrations/meeting/zoom');
const { sendEmail } = require('../integrations/email/mailer');

const router = express.Router();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

router.get('/bookings/availability', requireAuth, (req, res) => {
  res.json({ ok: true, slots: getAvailableSlots(14) });
});

// POST /api/bookings — client picks a slot. This is the single function
// that: creates the booking row, tries Zoom then Google Meet for a link
// (falling back to "link to be confirmed by email" if neither is
// configured), tries to create a real Google Calendar event if the admin
// has connected their calendar, generates an .ics attachment either way,
// and emails the client a confirmation.
router.post('/bookings', requireAuth, async (req, res) => {
  const { start, end, related_service_key, notes } = req.body;
  if (!start || !end) return res.status(400).json({ ok: false, errors: ['Select a time slot.'] });

  const client = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const id = randomUUID();
  const icsUid = `${id}@marketed`;

  // 1. Try to get a real meeting link.
  let meetingLink = null;
  let meetingProvider = 'manual';
  try {
    if (zoom.isConfigured()) {
      const hostEmail = process.env.ZOOM_HOST_EMAIL || process.env.SMTP_FROM;
      const zoomMeeting = await zoom.createMeeting({
        topic: `Marketed. discovery call — ${client.name}`,
        startISO: start,
        durationMinutes: Math.round((new Date(end) - new Date(start)) / 60000),
        hostEmail,
      });
      if (zoomMeeting) {
        meetingLink = zoomMeeting.joinUrl;
        meetingProvider = 'zoom';
      }
    }
  } catch (err) {
    console.error('Zoom meeting creation failed, falling back:', err.message);
  }

  // 2. If no Zoom link, try creating a Google Calendar event (which
  // generates a Google Meet link automatically) — requires the admin to
  // have connected their Google account via /api/calendar/google/connect.
  let googleEventId = null;
  if (!meetingLink) {
    try {
      const admin = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();
      if (admin && google.isConfigured()) {
        const event = await google.createEventWithMeet({
          userId: admin.id,
          summary: `Marketed. discovery call — ${client.name}`,
          description: notes || 'Discovery call booked via the Marketed. platform.',
          startISO: start,
          endISO: end,
          attendeeEmails: [client.email],
        });
        if (event) {
          meetingLink = event.meetLink;
          meetingProvider = 'google_meet';
          googleEventId = event.eventId;
        }
      }
    } catch (err) {
      console.error('Google Calendar event creation failed, falling back:', err.message);
    }
  }

  db.prepare(
    `INSERT INTO bookings (id, client_id, start_time, end_time, meeting_provider, meeting_link, google_event_id, ics_uid, related_service_key, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, client.id, start, end, meetingProvider, meetingLink, googleEventId, icsUid, related_service_key || null, notes || null);

await sendEmail({
    to: client.email,
    clientId: client.id,
    subject: 'Your MARKETED. discovery call is booked',
    body: [
      `Hi ${client.name},`,
      ``,
      `Your discovery call is confirmed for ${start}.`,
      meetingLink ? `Join link: ${meetingLink}` : `We'll send your join link shortly.`,
      ``,
      `Click the link below to add this event to your personal calendar:`,
      `${BASE_URL}/api/bookings/${id}/ics`,
      ``,
      `Here's to your YOU,`,
      `The MARKETED. Team`
    ].join('\n'),
  });

  res.status(201).json({ ok: true, booking: { id, start, end, meetingLink, meetingProvider } });
});

// Downloadable .ics — works for Apple Calendar, Outlook, and anywhere
// else that accepts a standard calendar file.
router.get('/bookings/:id/ics', requireAuth, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).send('Not found');

  const ics = generateICS({
    uid: booking.ics_uid,
    title: 'Marketed. discovery call',
    description: booking.meeting_link ? `Join: ${booking.meeting_link}` : 'Link to follow by email.',
    location: booking.meeting_link || '',
    start: booking.start_time,
    end: booking.end_time,
  });

  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', `attachment; filename="marketed-call.ics"`);
  res.send(ics);
});

router.get('/bookings/mine', requireAuth, (req, res) => {
  const bookings = db
    .prepare('SELECT * FROM bookings WHERE client_id = ? ORDER BY start_time DESC')
    .all(req.session.userId);
  res.json({ ok: true, bookings });
});

// Admin: full booking list, reschedule, mark complete/no-show.
router.get('/admin/bookings', requireAdmin, (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, u.name AS client_name, u.email AS client_email
       FROM bookings b JOIN users u ON u.id = b.client_id
       ORDER BY b.start_time DESC`
    )
    .all();
  res.json({ ok: true, bookings });
});

router.patch('/admin/bookings/:id', requireAdmin, async (req, res) => {
  const { status, start, end } = req.body;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ ok: false, errors: ['Booking not found.'] });

  if (start && end) {
    db.prepare('UPDATE bookings SET start_time = ?, end_time = ? WHERE id = ?').run(start, end, req.params.id);
  }
  if (status) {
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  }

  if (status || (start && end)) {
    const client = db.prepare('SELECT * FROM users WHERE id = ?').get(booking.client_id);
    await sendEmail({
      to: client.email,
      clientId: client.id,
      subject: status === 'completed' ? 'Your discovery call is complete' : 'Your Marketed. discovery call was updated',
      body: status === 'completed'
        ? `Thanks for the call, ${client.name} — we'll follow up with your recommended plan shortly.`
        : `Your discovery call has been updated. New status: ${status || booking.status}${start ? `, new time: ${start}` : ''}.`,
    });
  }

  res.json({ ok: true });
});

module.exports = router;
