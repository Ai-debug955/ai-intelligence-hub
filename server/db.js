import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'intelligence.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── CREATE TABLES ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'Other',
    impact TEXT DEFAULT 'Other',
    tags TEXT DEFAULT '',
    sources TEXT DEFAULT '[]',
    key_points TEXT DEFAULT '',
    submitted_by TEXT NOT NULL,
    reviewed_by TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    needs_review INTEGER DEFAULT 1,
    entry_type TEXT DEFAULT 'intelligence'
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    insight_id TEXT REFERENCES insights(id) ON DELETE CASCADE,
    reviewer TEXT NOT NULL,
    summary TEXT DEFAULT '',
    key_points TEXT DEFAULT '',
    review_date TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_content TEXT NOT NULL,
    generated_at TEXT DEFAULT (datetime('now')),
    generated_by TEXT DEFAULT ''
  );
`);

// Migrations
try { db.exec(`ALTER TABLE insights ADD COLUMN reviewer_notes TEXT DEFAULT ''`); } catch (_) {}
try { db.exec(`ALTER TABLE insights ADD COLUMN reviewed_at TEXT DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS panel_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    panel TEXT NOT NULL CHECK(panel IN ('ai_signal','financial_ai')),
    added_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('report','summary')),
    tokens INTEGER DEFAULT 0,
    actor TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

export default db;
export { DB_PATH };
