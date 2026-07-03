const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// This forces the script to find the correct database file inside your project path
const rootDb = path.join(__dirname, 'database.sqlite');
const dbDir = path.join(__dirname, 'src', 'db', 'database.sqlite');
const dataDb = path.join(__dirname, 'data', 'database.sqlite');

let dbPath = rootDb;

if (fs.existsSync(dbDir)) dbPath = dbDir;
else if (fs.existsSync(dataDb)) dbPath = dataDb;

console.log(`Attempting to apply table layout directly to database at: ${dbPath}`);

try {
  const db = new Database(dbPath, { verbose: console.log });
  
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
  
  console.log("Success! The 'google_tokens' table has been created.");
} catch (error) {
  console.error("Failed to execute database injection script:", error);
}
