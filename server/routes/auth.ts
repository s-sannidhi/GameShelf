import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import type { SessionWithUserId } from '../types/session.js';

const router = Router();
const SALT_ROUNDS = 10;

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existingEmail = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    if (existingEmail.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const existingUsername = await db.select().from(users).where(eq(users.username, username.trim())).limit(1);
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
    res.status(201).json({ id: user.id, username: user.username, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    (req.session as SessionWithUserId).userId = user.id;
    res.json({ id: user.id, username: user.username, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
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
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        steamId: users.steamId,
        psnRefreshToken: users.psnRefreshToken,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
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
    // @ts-expect-error - Express res.json typed as 0-arg in some envs
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get user' });
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
        const [u] = await db
          .select({ id: users.id, username: users.username, email: users.email, steamId: users.steamId, psnRefreshToken: users.psnRefreshToken })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!u) return res.status(401).json({ error: 'Not authenticated' });
        // @ts-expect-error - Express res.json typed as 0-arg in some envs
        return res.json({
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
    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        steamId: users.steamId,
        psnRefreshToken: users.psnRefreshToken,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    // @ts-expect-error - Express res.json typed as 0-arg in some envs
    res.json({
      id: row.id,
      username: row.username,
      email: row.email,
      steamId: row.steamId ?? null,
      psnLinked: Boolean(row.psnRefreshToken?.trim()),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
