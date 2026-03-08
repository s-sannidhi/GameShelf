import { Router } from 'express';
import { createRequire } from 'node:module';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import type { SessionWithUserId } from '../types/session.js';
import { runSteamSyncForUser } from './steam.js';
import { runPlaystationSyncForUser } from './playstation.js';

const require = createRequire(import.meta.url);
const { exchangeRefreshTokenForAuthTokens } = require('psn-api') as {
  exchangeRefreshTokenForAuthTokens: (refreshToken: string) => Promise<{ accessToken: string; refreshToken?: string }>;
};

const router = Router();

router.use(requireAuth);

/**
 * POST /api/sync/auto
 * Runs Steam and PlayStation sync for the current user using stored credentials (steam_id, psn_refresh_token).
 * Returns { steam?, playstation?, errors? }. Frontend should refetch games after.
 */
router.post('/auto', async (req, res) => {
  const userId = (req.session as SessionWithUserId)?.userId;
  if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
  const q = db.select({ steamId: users.steamId, psnRefreshToken: users.psnRefreshToken }).from(users).where(eq(users.id, userId));
  const [user] = await (q as unknown as { limit(n: number): Promise<{ steamId: string | null; psnRefreshToken: string | null }[]> }).limit(1);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const result: {
    steam?: { added: number; updated: number; total: number };
    playstation?: { added: number; updated: number; total: number };
    errors?: { steam?: string; playstation?: string };
  } = {};

  if (user.steamId?.trim()) {
    try {
      result.steam = await runSteamSyncForUser(userId, user.steamId.trim());
    } catch (e) {
      result.errors = result.errors ?? {};
      result.errors.steam = e instanceof Error ? e.message : 'Steam sync failed';
    }
  }

  if (user.psnRefreshToken?.trim()) {
    try {
      const auth = await exchangeRefreshTokenForAuthTokens(user.psnRefreshToken.trim());
      result.playstation = await runPlaystationSyncForUser(userId, { accessToken: auth.accessToken });
      if (auth.refreshToken) {
        await db.update(users).set({ psnRefreshToken: auth.refreshToken }).where(eq(users.id, userId));
      }
    } catch (e) {
      result.errors = result.errors ?? {};
      result.errors.playstation = e instanceof Error ? e.message : 'PlayStation sync failed';
    }
  }

  res.json(result);
});

export default router;
