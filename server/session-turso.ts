import type { Client } from '@libsql/client';

const oneDay = 86400000;

/** Minimal store interface compatible with express-session. */
export class TursoSessionStore {
  private table = 'sessions';
  constructor(private client: Client) {}

  get(sid: string, callback: (err: unknown, session?: unknown) => void): void {
    const now = Date.now();
    this.client
      .execute({
        sql: `SELECT sess FROM ${this.table} WHERE sid = ? AND ? <= expired`,
        args: [sid, now],
      })
      .then((result) => {
        const row = result.rows[0] as unknown as { sess: string } | undefined;
        if (!row) return callback(null, null);
        try {
          callback(null, JSON.parse(row.sess));
        } catch (e) {
          callback(e, null);
        }
      })
      .catch(callback);
  }

  set(sid: string, session: unknown, callback?: (err?: unknown) => void): void {
    try {
      const s = session as { cookie?: { maxAge?: number } };
      const maxAge = s?.cookie?.maxAge;
      const expired = maxAge ? Date.now() + maxAge : Date.now() + oneDay;
      const sess = JSON.stringify(session);
      this.client
        .execute({
          sql: `INSERT OR REPLACE INTO ${this.table} VALUES (?, ?, ?)`,
          args: [sid, expired, sess],
        })
        .then(() => callback?.())
        .catch((e) => callback?.(e));
    } catch (e) {
      callback?.(e);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    this.client
      .execute({ sql: `DELETE FROM ${this.table} WHERE sid = ?`, args: [sid] })
      .then(() => callback?.())
      .catch((e) => callback?.(e));
  }
}
