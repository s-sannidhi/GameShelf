import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

const url = process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL ?? '';
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN ?? '';
if (!url || !authToken) {
  throw new Error('Turso requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (or LIBSQL_* env vars).');
}

export const client = createClient({ url, authToken });
export const db = drizzle(client, { schema });
