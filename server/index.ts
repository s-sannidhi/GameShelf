/// <reference path="./types/express-session.d.ts" />
/// <reference path="./types/express.d.ts" />
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import connectSqlite3 from 'connect-sqlite3';

const require = createRequire(import.meta.url);
import { runMigrations } from './db/migrate.js';
import gamesRouter from './routes/games.js';
import metadataRouter from './routes/metadata.js';
import steamRouter from './routes/steam.js';
import playstationRouter from './routes/playstation.js';
import syncRouter from './routes/sync.js';
import authRouter from './routes/auth.js';
import friendsRouter from './routes/friends.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const tursoUrl = process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
const useTurso = Boolean(tursoUrl && tursoToken);
const isVercel = Boolean(process.env.VERCEL);

async function createApp(): Promise<express.Express> {
  await runMigrations();

  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
  const isProd = process.env.NODE_ENV === 'production';

  type SessionStoreLike = {
    get(sid: string, callback: (err: unknown, session?: unknown) => void): void;
    set(sid: string, session: unknown, callback?: (err?: unknown) => void): void;
    destroy(sid: string, callback?: (err?: unknown) => void): void;
  };
  let sessionStore: SessionStoreLike;
  if (useTurso) {
    const { client } = await import('./db/turso.js');
    const { TursoSessionStore } = await import('./session-turso.js');
    sessionStore = new TursoSessionStore(client);
  } else {
    const sessionModule = require('express-session') as (opts: object) => express.RequestHandler;
    const SQLiteStore = connectSqlite3(sessionModule);
    sessionStore = new SQLiteStore({ db: 'sessions.db', dir: './data' });
  }

  const app = express();
  const allowedOrigin = process.env.ALLOWED_ORIGIN ?? process.env.FRONTEND_URL ?? '';
  app.use(
    cors({
      origin: isProd && allowedOrigin ? allowedOrigin.split(',').map((o) => o.trim()).filter(Boolean) : true,
      credentials: true,
    })
  );
  app.use(express.json());
  const sessionMiddleware = require('express-session') as (options: {
    store: SessionStoreLike;
    secret: string;
    resave: boolean;
    saveUninitialized: boolean;
    cookie: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; maxAge: number };
  }) => express.RequestHandler;
  app.use(
    sessionMiddleware({
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/metadata', metadataRouter);
  app.use('/api/steam', steamRouter);
  app.use('/api/playstation', playstationRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/friends', friendsRouter);

  if (isProd && !isVercel) {
    app.use(express.static(path.join(__dirname, '../dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../dist/index.html'));
    });
  }

  return app;
}

// Standalone server (Render, Fly, npm start)
if (!isVercel) {
  const PORT = process.env.PORT || 3001;
  createApp().then((app) => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      const hasRawg = process.env.RAWG_API_KEY?.trim() || process.env.rawg_api_key?.trim();
      const hasSteam = process.env.STEAM_API_KEY?.trim() || process.env.steam_api_key?.trim();
      const hasTwitch = process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim();
      const hasMetadata = hasRawg || hasTwitch;
      console.log(hasMetadata ? `Metadata: ${hasRawg ? 'RAWG' : ''}${hasRawg && hasTwitch ? ' + ' : ''}${hasTwitch ? 'IGDB (Twitch)' : ''} configured` : 'Metadata: not configured (add RAWG_API_KEY or TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET to .env)');
      console.log(hasSteam ? 'Steam sync: configured' : 'Steam sync: not configured (add STEAM_API_KEY, optional STEAM_ID)');
      console.log('PlayStation sync: available (user provides NPSSO token)');
    });
  });
}

export { createApp };
