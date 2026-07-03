// src/integrations/calendar/ics.js
// Generates a standard .ics file for a booking. This is the real,
// working way to support Apple Calendar (and Outlook, and anything else)
// on the web: Apple does not offer a public two-way calendar API for
// third-party web apps, so "sync to Apple Calendar" in practice means
// "download/subscribe to an .ics file". Google Calendar sync (two-way,
// automatic) is handled separately in google.js.

function toICSDate(isoString) {
  return isoString.replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICS(text) {
  return String(text).replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
}

function generateICS({ uid, title, description, location, start, end }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Marketed.//Discovery Call//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(description || '')}`,
    `LOCATION:${escapeICS(location || '')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

module.exports = { generateICS };
