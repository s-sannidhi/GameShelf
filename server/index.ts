import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
// @ts-expect-error connect-sqlite3 has no type defs
import connectSqlite3 from 'connect-sqlite3';
import { runMigrations } from './db/migrate';
import gamesRouter from './routes/games';
import metadataRouter from './routes/metadata';
import steamRouter from './routes/steam';
import playstationRouter from './routes/playstation';
import syncRouter from './routes/sync';
import authRouter from './routes/auth';
import friendsRouter from './routes/friends';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

runMigrations();

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

const SQLiteStore = connectSqlite3(session);
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';

const allowedOrigin = process.env.ALLOWED_ORIGIN ?? process.env.FRONTEND_URL ?? '';
app.use(
  cors({
    origin: isProd && allowedOrigin ? allowedOrigin.split(',').map((o) => o.trim()).filter(Boolean) : true,
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: './data' }),
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

app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);
app.use('/api/metadata', metadataRouter);
app.use('/api/steam', steamRouter);
app.use('/api/playstation', playstationRouter);
app.use('/api/sync', syncRouter);
app.use('/api/friends', friendsRouter);

if (isProd) {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

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
