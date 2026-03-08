import bcrypt from 'bcrypt';

const tursoUrl = process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
const useTurso = Boolean(tursoUrl && tursoToken);

async function runMigrationsTurso(): Promise<void> {
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: tursoUrl!, authToken: tursoToken! });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await client.execute(`
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

  const tableInfo = await client.execute({ sql: 'PRAGMA table_info(games)', args: [] });
  const columns = (tableInfo.rows as unknown as { name: string }[]).map((r) => r.name);
  if (!columns.includes('user_id')) await client.execute('ALTER TABLE games ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;');
  if (!columns.includes('box_art_url')) await client.execute('ALTER TABLE games ADD COLUMN box_art_url TEXT;');
  if (!columns.includes('canonical_id')) await client.execute('ALTER TABLE games ADD COLUMN canonical_id TEXT;');
  if (!columns.includes('screenshots')) await client.execute('ALTER TABLE games ADD COLUMN screenshots TEXT;');
  if (!columns.includes('spine_cover_url')) await client.execute('ALTER TABLE games ADD COLUMN spine_cover_url TEXT;');
  if (!columns.includes('developer')) await client.execute('ALTER TABLE games ADD COLUMN developer TEXT;');
  if (!columns.includes('publisher')) await client.execute('ALTER TABLE games ADD COLUMN publisher TEXT;');
  if (!columns.includes('trailer_url')) await client.execute('ALTER TABLE games ADD COLUMN trailer_url TEXT;');
  if (!columns.includes('tags')) await client.execute('ALTER TABLE games ADD COLUMN tags TEXT;');

  const userTableInfo = await client.execute({ sql: 'PRAGMA table_info(users)', args: [] });
  const userColumns = (userTableInfo.rows as unknown as { name: string }[]).map((r) => r.name);
  if (!userColumns.includes('steam_id')) await client.execute('ALTER TABLE users ADD COLUMN steam_id TEXT;');
  if (!userColumns.includes('psn_refresh_token')) await client.execute('ALTER TABLE users ADD COLUMN psn_refresh_token TEXT;');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      friend_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
  `);
  await client.execute('DROP TABLE IF EXISTS sync_log;');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sessions (sid PRIMARY KEY, expired, sess);
  `);

  const countResult = await client.execute({ sql: 'SELECT COUNT(*) as c FROM users', args: [] });
  const row = countResult.rows[0] as unknown as { c: number } | undefined;
  const userCount = row?.c ?? 0;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('changeme', 10);
    const now = new Date().toISOString();
    await client.execute({
      sql: 'INSERT INTO users (id, username, email, password_hash, created_at) VALUES (1, ?, ?, ?, ?)',
      args: ['imported', 'imported@local', hash, now],
    });
    console.log('[DB] Created default user: username=imported, password=changeme (change after first login)');
  }
}

function runMigrationsSqlite(): void {
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const path = require('path');
  const { existsSync, mkdirSync } = require('fs');

  const dataDir = path.join(process.cwd(), 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, 'library.db'));

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

  const tableInfo = sqlite.prepare('PRAGMA table_info(games)').all() as { name: string }[];
  if (!tableInfo.some((c) => c.name === 'user_id')) sqlite.exec('ALTER TABLE games ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;');
  if (!tableInfo.some((c) => c.name === 'box_art_url')) sqlite.exec('ALTER TABLE games ADD COLUMN box_art_url TEXT;');
  if (!tableInfo.some((c) => c.name === 'canonical_id')) sqlite.exec('ALTER TABLE games ADD COLUMN canonical_id TEXT;');
  if (!tableInfo.some((c) => c.name === 'screenshots')) sqlite.exec('ALTER TABLE games ADD COLUMN screenshots TEXT;');
  if (!tableInfo.some((c) => c.name === 'spine_cover_url')) sqlite.exec('ALTER TABLE games ADD COLUMN spine_cover_url TEXT;');
  if (!tableInfo.some((c) => c.name === 'developer')) sqlite.exec('ALTER TABLE games ADD COLUMN developer TEXT;');
  if (!tableInfo.some((c) => c.name === 'publisher')) sqlite.exec('ALTER TABLE games ADD COLUMN publisher TEXT;');
  if (!tableInfo.some((c) => c.name === 'trailer_url')) sqlite.exec('ALTER TABLE games ADD COLUMN trailer_url TEXT;');
  if (!tableInfo.some((c) => c.name === 'tags')) sqlite.exec('ALTER TABLE games ADD COLUMN tags TEXT;');

  const userTableInfo = sqlite.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userTableInfo.some((c) => c.name === 'steam_id')) sqlite.exec('ALTER TABLE users ADD COLUMN steam_id TEXT;');
  if (!userTableInfo.some((c) => c.name === 'psn_refresh_token')) sqlite.exec('ALTER TABLE users ADD COLUMN psn_refresh_token TEXT;');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      friend_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
  `);
  sqlite.exec('DROP TABLE IF EXISTS sync_log;');

  const userCount = (sqlite.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('changeme', 10);
    const now = new Date().toISOString();
    sqlite.prepare('INSERT INTO users (id, username, email, password_hash, created_at) VALUES (1, ?, ?, ?, ?)').run('imported', 'imported@local', hash, now);
    console.log('[DB] Created default user: username=imported, password=changeme (change after first login)');
  }
  sqlite.close();
}

export async function runMigrations(): Promise<void> {
  if (useTurso) {
    await runMigrationsTurso();
  } else {
    runMigrationsSqlite();
  }
}
