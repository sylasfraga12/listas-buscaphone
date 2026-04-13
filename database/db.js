const Database = require('better-sqlite3');
const path = require('path');

// Em produção (Railway), usar volume persistente via DATABASE_PATH
// Ex: DATABASE_PATH=/data/listas.db
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'listas.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ──────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id           TEXT UNIQUE NOT NULL,
    name               TEXT,
    type               TEXT,
    is_community       INTEGER DEFAULT 0,
    total_participants INTEGER DEFAULT 0,
    created_at         TEXT DEFAULT (datetime('now')),
    last_msg_at        TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT,
    zapster_msg_id  TEXT,
    group_id        TEXT NOT NULL,
    group_name      TEXT,
    group_type      TEXT,
    is_community    INTEGER DEFAULT 0,
    sender_name     TEXT,
    sender_phone    TEXT,
    content         TEXT NOT NULL,
    content_type    TEXT DEFAULT 'text',
    sent_at         TEXT,
    received_at     TEXT DEFAULT (datetime('now')),
    processed       INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS processed_messages (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id          INTEGER REFERENCES messages(id),
    original_text       TEXT NOT NULL,
    processed_text      TEXT,
    input_tokens        INTEGER DEFAULT 0,
    output_tokens       INTEGER DEFAULT 0,
    cost_usd            REAL DEFAULT 0,
    processed_at        TEXT DEFAULT (datetime('now')),
    sent_to_buscaphone  INTEGER DEFAULT 0,
    buscaphone_status   INTEGER,
    buscaphone_response TEXT,
    error               TEXT
  );

  CREATE TABLE IF NOT EXISTS api_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    service       TEXT NOT NULL,
    direction     TEXT NOT NULL,
    method        TEXT,
    endpoint      TEXT,
    status_code   INTEGER,
    request_body  TEXT,
    response_body TEXT,
    duration_ms   INTEGER,
    success       INTEGER DEFAULT 1,
    error_msg     TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );
`);

// Settings
db.exec(`CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
)`);
const defaults = [
  ['buscaphone_url',   'http://localhost:4000/buscaphone/receber'],
  ['buscaphone_token', ''],
  ['auto_send',        '0'],
];
const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
defaults.forEach(([k, v]) => insertSetting.run(k, v));

// Migrações — adiciona colunas novas sem quebrar banco existente
const migrations = [
  `ALTER TABLE messages ADD COLUMN event_id TEXT`,
  `ALTER TABLE messages ADD COLUMN zapster_msg_id TEXT`,
  `ALTER TABLE messages ADD COLUMN group_type TEXT`,
  `ALTER TABLE messages ADD COLUMN is_community INTEGER DEFAULT 0`,
  `ALTER TABLE messages ADD COLUMN sender_name TEXT`,
  `ALTER TABLE messages ADD COLUMN sender_phone TEXT`,
  `ALTER TABLE messages ADD COLUMN content_type TEXT DEFAULT 'text'`,
  `ALTER TABLE messages ADD COLUMN sent_at TEXT`,
  `ALTER TABLE groups ADD COLUMN type TEXT`,
  `ALTER TABLE groups ADD COLUMN is_community INTEGER DEFAULT 0`,
  `ALTER TABLE groups ADD COLUMN total_participants INTEGER DEFAULT 0`,
];

for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* coluna já existe */ }
}

module.exports = db;
