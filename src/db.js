// src/db.js
// Single shared SQLite connection (better-sqlite3 is synchronous, which
// keeps route handlers simple — no await needed for queries).

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DATA_DIR is configurable so the database can live on a persistent
// Railway Volume (or any mounted disk) instead of the app's ephemeral
// filesystem. Falls back to a local ./data folder for local dev.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Filename kept as vantage.db intentionally — this is the existing
// database file with all current users, leads, and bookings in it.
// Renaming it would orphan that data.
const DB_PATH = path.join(DATA_DIR, 'vantage.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

module.exports = db;

