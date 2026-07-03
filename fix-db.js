const Database = require('better-sqlite3');
// Update this path to where your actual .sqlite file is if it's named differently
const db = new Database('database.sqlite', { verbose: console.log }); 

db.exec(`
  CREATE TABLE IF NOT EXISTS google_tokens (
    id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT,
    token_type TEXT,
    expiry_date INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("Table 'google_tokens' created successfully!");
