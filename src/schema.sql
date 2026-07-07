-- schema.sql
-- SQLite schema for the Marketed. platform.
-- File-based DB (data/vantage.db) — no external database server needed to
-- start. Swap to Postgres later by translating this schema; the query
-- layer in src/db.js is the only place that would need to change.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('client', 'admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  terms_accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- express-session store (connect-sqlite3 manages its own table, listed
-- here only for visibility — it creates itself automatically).

CREATE TABLE IF NOT EXISTS services (
  key TEXT PRIMARY KEY,               -- e.g. 'ppc', 'email_sms'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  complexity TEXT NOT NULL CHECK (complexity IN ('simple', 'complex')),
  price_note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES users(id),
  service_key TEXT NOT NULL REFERENCES services(key),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'needs_call', 'approved', 'declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES users(id),
  start_time TEXT NOT NULL,          -- ISO 8601, UTC
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  meeting_provider TEXT,              -- 'zoom' | 'google_meet' | 'manual'
  meeting_link TEXT,
  google_event_id TEXT,               -- set if admin has Google Calendar connected
  ics_uid TEXT NOT NULL,
  related_service_key TEXT REFERENCES services(key),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_services (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES users(id),
  service_key TEXT NOT NULL REFERENCES services(key),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled')),
  price_note TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS client_channels (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES users(id),
  channel_type TEXT NOT NULL,         -- 'google_ads' | 'meta_ads' | 'klaviyo' | 'semrush' | 'adroll' | 'webhook'
  label TEXT NOT NULL,
  credentials_encrypted TEXT NOT NULL, -- JSON blob, encrypted at rest (see utils/crypto.js)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'error')),
  last_error TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  client_channel_id TEXT NOT NULL REFERENCES client_channels(id),
  metric_key TEXT NOT NULL,           -- 'spend' | 'clicks' | 'ctr' | 'conversions' | 'open_rate' | etc.
  metric_value REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  budget TEXT,
  services TEXT,                      -- JSON array
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'converted', 'lost')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES users(id),
  lead_id TEXT REFERENCES leads(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by_admin_id TEXT REFERENCES users(id),
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cancellation_requests (
  id TEXT PRIMARY KEY,
  client_service_id TEXT NOT NULL REFERENCES client_services(id),
  client_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_channel ON metrics(client_channel_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_interests_client ON interests(client_id);
CREATE INDEX IF NOT EXISTS idx_client_services_client ON client_services(client_id);
CREATE INDEX IF NOT EXISTS idx_client_channels_client ON client_channels(client_id);
