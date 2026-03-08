import type { SessionData, Store } from 'express-session';
import type { Client } from '@libsql/client';

const oneDay = 86400000;

export class TursoSessionStore extends Store {
  private table = 'sessions';
  constructor(private client: Client) {
    super();
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    const now = Date.now();
    this.client
      .execute({
        sql: `SELECT sess FROM ${this.table} WHERE sid = ? AND ? <= expired`,
        args: [sid, now],
      })
      .then((result) => {
        const row = result.rows[0] as { sess: string } | undefined;
        if (!row) return callback(null, null);
        try {
          callback(null, JSON.parse(row.sess) as SessionData);
        } catch (e) {
          callback(e, null);
        }
      })
      .catch(callback);
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    try {
      const maxAge = session.cookie?.maxAge;
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
