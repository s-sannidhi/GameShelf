const tursoUrl = process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
const useTurso = Boolean(tursoUrl && tursoToken);

// Load only one driver so Vercel doesn't pull in native better-sqlite3
export const { db } = useTurso
  ? await import('./turso.js')
  : await import('./sqlite.js');
