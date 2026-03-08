import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import bcrypt from 'bcrypt';

const dataDir = path.join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'library.db');
const sqlite = new Database(dbPath);

export function runMigrations(): void {
  // Create users table if not exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id),
      external_id TEXT,
      canonical_id TEXT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'Other',
      source TEXT NOT NULL DEFAULT 'manual',
      cover_url TEXT,
      box_art_url TEXT,
      description TEXT,
      release_date TEXT,
      genres TEXT,
      playtime_minutes INTEGER,
      completed_at TEXT,
      rating INTEGER,
      notes TEXT,
      store_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Add columns to games if they don't exist (SQLite doesn't support IF NOT EXISTS for columns)
  const tableInfo = sqlite.prepare("PRAGMA table_info(games)").all() as { name: string }[];
  const hasUserId = tableInfo.some((c) => c.name === 'user_id');
  if (!hasUserId) {
    sqlite.exec(`ALTER TABLE games ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;`);
  }
  const hasBoxArtUrl = tableInfo.some((c) => c.name === 'box_art_url');
  if (!hasBoxArtUrl) {
    sqlite.exec(`ALTER TABLE games ADD COLUMN box_art_url TEXT;`);
  }
  const hasCanonicalId = tableInfo.some((c) => c.name === 'canonical_id');
  if (!hasCanonicalId) {
    sqlite.exec(`ALTER TABLE games ADD COLUMN canonical_id TEXT;`);
  }

  const userTableInfo = sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userTableInfo.some((c) => c.name === 'steam_id')) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN steam_id TEXT;`);
  }
  if (!userTableInfo.some((c) => c.name === 'psn_refresh_token')) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN psn_refresh_token TEXT;`);
  }

  // Create friendships if not exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      friend_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
  `);

  // Create friend_requests if not exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
  `);

  // Drop sync_log if exists (legacy)
  sqlite.exec(`DROP TABLE IF EXISTS sync_log;`);

  // Seed default user (id 1) for existing games if no users exist
  const userCount = (sqlite.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('changeme', 10);
    const now = new Date().toISOString();
    sqlite.prepare(
      "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (1, ?, ?, ?, ?)"
    ).run('imported', 'imported@local', hash, now);
    console.log('[DB] Created default user: username=imported, password=changeme (change after first login)');
  }

  sqlite.close();
}
