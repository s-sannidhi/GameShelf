import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(path.join(dataDir, 'library.db'));
export const db = drizzle(sqlite, { schema });
