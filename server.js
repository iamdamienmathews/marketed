// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');

const db = require('./src/db'); // ensures schema is created on boot
const { startScheduler } = require('./src/integrations/channels/sync');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');

app.set('trust proxy', 1);
app.use(express.json());

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — this is what keeps users logged in
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api', require('./src/routes/services'));
app.use('/api', require('./src/routes/bookings'));
app.use('/api', require('./src/routes/calendar'));
app.use('/api', require('./src/routes/metrics'));
app.use('/api', require('./src/routes/leads'));
app.use('/api', require('./src/routes/clients'));
app.use('/api/admin', require('./src/routes/admin'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, errors: ['Unexpected server error.'] });
});

app.listen(PORT, () => {
  console.log(`Marketed. platform running at ${BASE_URL}`);
  startScheduler();
});
