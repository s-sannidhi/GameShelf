import type { Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import type { SessionWithUserId } from '../types/session.js';
import { createAuthToken } from '../auth-token.js';

const router = Router();
const SALT_ROUNDS = 10;

function sendJson(res: Response, body: unknown): void {
  if (res.headersSent) return;
  try {
    (res as unknown as { json: (b: unknown) => void }).json(body);
  } catch (e) {
    console.error('[auth] sendJson', e);
    if (!res.headersSent) res.status(500).json({ error: 'Response failed' });
  }
}

/** Debug: no auth. Server cookie config (for cross-origin troubleshooting). */
router.get('/cookie-config', (_req, res) => {
  const allowed = process.env.ALLOWED_ORIGIN ?? process.env.FRONTEND_URL ?? '';
  const forceNone = process.env.SESSION_SAME_SITE_NONE === '1' || process.env.SESSION_SAME_SITE_NONE === 'true';
  const crossOrigin = Boolean(allowed.trim());
  const sameSite = crossOrigin || forceNone ? 'none' : 'lax';
  sendJson(res, { crossOrigin, sameSite, hasAllowedOrigin: crossOrigin });
});

/** Debug: no auth. Shows if cookie was sent and if session exists (for cross-origin cookie troubleshooting). */
router.get('/session-check', (req, res) => {
  const cookieHeader = req.headers.cookie ?? '';
  const cookieSent = /connect\.sid=([^\s;]+)/.test(cookieHeader);
  const session = req.session as SessionWithUserId | undefined;
  const hasUserId = Boolean(session?.userId);
  sendJson(res, { cookieSent, hasSession: !!req.session, hasUserId });
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existingEmail = await (db.select().from(users).where(eq(users.email, email.trim().toLowerCase())) as unknown as { limit(n: number): Promise<typeof users.$inferSelect[]> }).limit(1);
    if (existingEmail.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const existingUsername = await (db.select().from(users).where(eq(users.username, username.trim())) as unknown as { limit(n: number): Promise<typeof users.$inferSelect[]> }).limit(1);
    if (existingUsername.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date().toISOString();
    const [user] = await db
      .insert(users)
      .values({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        createdAt: now,
      })
      .returning();
    if (!user) {
      return res.status(500).json({ error: 'Registration failed' });
    }
    (req.session as SessionWithUserId).userId = user.id;
    (req.session as { save: (cb: (err?: Error) => void) => void }).save((err) => {
      if (err) {
        console.error('[auth] register session.save', err);
        if (!res.headersSent) {
          const msg = process.env.EXPOSE_API_ERROR === '1' && err instanceof Error ? err.message : 'Registration failed';
          res.status(500).json({ error: msg });
        }
        return;
      }
      if (!res.headersSent) {
        res.status(201);
        const token = createAuthToken(user.id);
        sendJson(res, { id: user.id, username: user.username, email: user.email, token });
      }
    });
  } catch (err) {
    console.error('[auth] register', err);
    if (!res.headersSent) res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const [user] = await (db.select().from(users).where(eq(users.email, email.trim().toLowerCase())) as unknown as { limit(n: number): Promise<typeof users.$inferSelect[]> }).limit(1);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    (req.session as SessionWithUserId).userId = user.id;
    (req.session as { save: (cb: (err?: Error) => void) => void }).save((err) => {
      if (err) {
        console.error('[auth] login session.save', err);
        if (!res.headersSent) {
          const msg = process.env.EXPOSE_API_ERROR === '1' && err instanceof Error ? err.message : 'Login failed';
          res.status(500).json({ error: msg });
        }
        return;
      }
      const token = createAuthToken(user.id);
      sendJson(res, { id: user.id, username: user.username, email: user.email, token });
    });
  } catch (err) {
    console.error('[auth] login', err);
    if (!res.headersSent) {
      const msg = process.env.EXPOSE_API_ERROR === '1' && err instanceof Error ? err.message : 'Login failed';
      res.status(500).json({ error: msg });
    }
  }
});

router.post('/logout', (req, res) => {
  const session = req.session as SessionWithUserId | undefined;
  if (session?.destroy) {
    session.destroy((err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.status(204).send();
    });
  } else {
    res.status(204).send();
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = (req.session as SessionWithUserId)?.userId;
    if (userId == null) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const q1 = db.select({ id: users.id, username: users.username, email: users.email, steamId: users.steamId, psnRefreshToken: users.psnRefreshToken }).from(users).where(eq(users.id, userId));
    const [row] = await (q1 as unknown as { limit(n: number): Promise<{ id: number; username: string; email: string; steamId: string | null; psnRefreshToken: string | null }[]> }).limit(1);
    if (!row) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = {
      id: row.id,
      username: row.username,
      email: row.email,
      steamId: row.steamId ?? null,
      psnLinked: Boolean(row.psnRefreshToken?.trim()),
    };
    sendJson(res, user);
  } catch (err) {
    console.error('[auth] get /me', err);
    if (!res.headersSent) {
      const msg = process.env.EXPOSE_API_ERROR === '1' && err instanceof Error ? err.message : 'Failed to get user';
      res.status(500).json({ error: msg });
    }
  }
});

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const userId = (req.session as SessionWithUserId)?.userId;
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const body = req.body as { steamId?: string | null };
    if (body.steamId !== undefined) {
      if (body.steamId === null || (typeof body.steamId === 'string' && !body.steamId.trim())) {
        await db.update(users).set({ steamId: null }).where(eq(users.id, userId));
        const qu = db.select({ id: users.id, username: users.username, email: users.email, steamId: users.steamId, psnRefreshToken: users.psnRefreshToken }).from(users).where(eq(users.id, userId));
        const [u] = await (qu as unknown as { limit(n: number): Promise<{ id: number; username: string; email: string; steamId: string | null; psnRefreshToken: string | null }[]> }).limit(1);
        if (!u) return res.status(401).json({ error: 'Not authenticated' });
        return sendJson(res, {
          id: u.id,
          username: u.username,
          email: u.email,
          steamId: u.steamId ?? null,
          psnLinked: Boolean(u.psnRefreshToken?.trim()),
        });
      }
      const raw = String(body.steamId).trim();
      const { resolveToSteamId64 } = await import('./steam.js');
      const dotenv = await import('dotenv');
      const path = await import('path');
      dotenv.config({ path: path.join(process.cwd(), '.env') });
      const apiKey = (process.env.STEAM_API_KEY ?? process.env.steam_api_key)?.trim();
      if (!apiKey) {
        return res.status(503).json({ error: 'Steam not configured. Add STEAM_API_KEY to .env.' });
      }
      const steamId64 = /^\d{17}$/.test(raw) ? raw : await resolveToSteamId64(apiKey, raw);
      if (!steamId64) {
        return res.status(400).json({ error: 'Could not resolve Steam ID. Use your full profile URL or 17-digit 64-bit ID.' });
      }
      await db.update(users).set({ steamId: steamId64 }).where(eq(users.id, userId));
    }
    const q2 = db.select({ id: users.id, username: users.username, email: users.email, steamId: users.steamId, psnRefreshToken: users.psnRefreshToken }).from(users).where(eq(users.id, userId));
    const [row] = await (q2 as unknown as { limit(n: number): Promise<{ id: number; username: string; email: string; steamId: string | null; psnRefreshToken: string | null }[]> }).limit(1);
    if (!row) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    sendJson(res, {
      id: row.id,
      username: row.username,
      email: row.email,
      steamId: row.steamId ?? null,
      psnLinked: Boolean(row.psnRefreshToken?.trim()),
    });
  } catch (err) {
    console.error('[auth] patch /me', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
