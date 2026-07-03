// src/utils/slots.js
// Generates open discovery-call slots for the next N business days,
// filtering out anything already booked. Working hours are configurable
// via .env so the agency can set their real hours without touching code.

const db = require('../db');

const WORK_START_HOUR = parseInt(process.env.WORK_START_HOUR || '9', 10); // 9am
const WORK_END_HOUR = parseInt(process.env.WORK_END_HOUR || '17', 10);   // 5pm
const SLOT_MINUTES = parseInt(process.env.SLOT_MINUTES || '30', 10);
const TIMEZONE_OFFSET_HOURS = parseInt(process.env.TZ_OFFSET_HOURS || '0', 10); // vs UTC

function getAvailableSlots(daysAhead = 10) {
  const now = new Date();
  const booked = db
    .prepare(`SELECT start_time, end_time FROM bookings WHERE status = 'scheduled'`)
    .all()
    .map((b) => ({ start: new Date(b.start_time), end: new Date(b.end_time) }));

  const slots = [];

  for (let d = 1; d <= daysAhead; d++) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() + d);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip weekends

    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h += SLOT_MINUTES / 60) {
      const start = new Date(Date.UTC(
        day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(),
        Math.floor(h) - TIMEZONE_OFFSET_HOURS, (h % 1) * 60
      ));
      const end = new Date(start.getTime() + SLOT_MINUTES * 60000);

      const overlaps = booked.some((b) => start < b.end && end > b.start);
      if (!overlaps) {
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
  }

  return slots;
}

module.exports = { getAvailableSlots };
