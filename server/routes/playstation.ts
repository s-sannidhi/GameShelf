import { createRequire } from 'node:module';
import { Router } from 'express';
import { db } from '../db/index.js';
import { games, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import type { SessionWithUserId } from '../types/session.js';
import { getCanonicalIdForGameName, getIgdbBoxArtForGame } from './metadata.js';

function getUserId(req: { session?: SessionWithUserId }): number | undefined {
  return (req.session as SessionWithUserId | undefined)?.userId;
}

const require = createRequire(import.meta.url);
const {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  getUserTitles,
} = require('psn-api') as {
  exchangeNpssoForAccessCode: (npsso: string) => Promise<string>;
  exchangeAccessCodeForAuthTokens: (code: string) => Promise<{ accessToken: string; refreshToken?: string }>;
  exchangeRefreshTokenForAuthTokens: (refreshToken: string) => Promise<{ accessToken: string; refreshToken?: string }>;
  getUserTitles: (auth: { accessToken: string }, accountId: string, opts?: { limit?: number }) => Promise<{ trophyTitles: Array<{ npCommunicationId: string; trophyTitleName: string; trophyTitleIconUrl: string; trophyTitlePlatform?: string }> }>;
};

const router = Router();

router.use(requireAuth);

function normalizeGameNameForMatch(name: string): string {
  let s = name.trim().toLowerCase();
  s = s.replace(/\s*[(\[][\d]{4}[)\]]\s*$/i, '');
  s = s.replace(/\s*-\s*(standard|digital|deluxe|edition|game of the year|goty|complete).*$/i, '');
  s = s.replace(/\s*[(\[].*[)\]]\s*$/g, '');
  return s.trim() || name.trim().toLowerCase();
}

/** Core sync: fetch PSN titles and upsert into games. Used by POST /sync and auto-sync. */
export async function runPlaystationSyncForUser(
  userId: number,
  auth: { accessToken: string }
): Promise<{ added: number; updated: number; total: number }> {
  const { trophyTitles } = await getUserTitles(auth, 'me', { limit: 800 });
  const now = new Date().toISOString();
  const canonicalCache = new Map<string, string | null>();
  const igdbArtCache = new Map<string, string | null>();
  let userGames = await db.select().from(games).where(eq(games.userId, userId));
  const mergedIds = new Set<number>();
  let added = 0;
  let updated = 0;
  for (const t of trophyTitles) {
    const externalId = t.npCommunicationId;
    const name = t.trophyTitleName;
    const psnCover = t.trophyTitleIconUrl;
    const platform = t.trophyTitlePlatform?.includes('PS5') ? 'PlayStation 5' : t.trophyTitlePlatform?.includes('PS4') ? 'PlayStation 4' : 'PlayStation';
    let existing = await db
      .select()
      .from(games)
      .where(and(eq(games.userId, userId), eq(games.externalId, externalId), eq(games.source, 'playstation')));
    let canonicalId: string | null = null;
    if (existing.length === 0) {
      const cacheKey = name.trim().toLowerCase();
      if (!canonicalCache.has(cacheKey)) {
        canonicalCache.set(cacheKey, await getCanonicalIdForGameName(name));
      }
      canonicalId = canonicalCache.get(cacheKey) ?? null;
      if (canonicalId) {
        const byCanon = await db.select().from(games).where(and(eq(games.userId, userId), eq(games.canonicalId, canonicalId)));
        if (byCanon.length > 0) {
          existing = [byCanon[0]];
          if (byCanon.length > 1) {
            for (let i = 1; i < byCanon.length; i++) {
              await db.delete(games).where(eq(games.id, byCanon[i].id));
              mergedIds.add(byCanon[i].id);
            }
            userGames = userGames.filter((ug) => !mergedIds.has(ug.id));
          }
        }
      }
      if (existing.length === 0) {
        const nameLower = name.trim().toLowerCase();
        let byName = nameLower
          ? await db
              .select()
              .from(games)
              .where(and(eq(games.userId, userId), sql`LOWER(trim(${games.name})) = ${nameLower}`))
          : [];
        if (byName.length === 0) {
          const norm = normalizeGameNameForMatch(name);
          if (norm) {
            const fromList = userGames.filter((ug) => normalizeGameNameForMatch(ug.name ?? '') === norm && !mergedIds.has(ug.id));
            if (fromList.length > 0) byName = fromList;
          }
        }
        if (byName.length > 0) {
          existing = [byName[0]];
          if (byName.length > 1) {
            for (let i = 1; i < byName.length; i++) {
              await db.delete(games).where(eq(games.id, byName[i].id));
              mergedIds.add(byName[i].id);
            }
            userGames = userGames.filter((ug) => !mergedIds.has(ug.id));
          }
        }
      }
    }
    let coverUrl = psnCover;
    let boxArtUrl = psnCover;
    const igdbCacheKey = `${name.trim().toLowerCase()}\n${canonicalId ?? ''}`;
    if (!igdbArtCache.has(igdbCacheKey)) {
      igdbArtCache.set(igdbCacheKey, await getIgdbBoxArtForGame(name, canonicalId));
    }
    const igdbArt = igdbArtCache.get(igdbCacheKey);
    if (igdbArt) {
      coverUrl = igdbArt;
      boxArtUrl = igdbArt;
    }
    if (existing.length > 0) {
      const existingGame = existing[0];
      // Preserve manually set art: only overwrite cover/boxArt if the game has none yet
      const keepCover = existingGame.coverUrl?.trim();
      const keepBoxArt = existingGame.boxArtUrl?.trim();
      await db
        .update(games)
        .set({
          name,
          coverUrl: keepCover ? existingGame.coverUrl : coverUrl,
          boxArtUrl: keepBoxArt ? existingGame.boxArtUrl : boxArtUrl,
          externalId,
          source: 'playstation',
          platform,
          ...(canonicalId && { canonicalId }),
          updatedAt: now,
        })
        .where(eq(games.id, existingGame.id));
      updated++;
    } else {
      await db.insert(games).values({
        userId,
        name,
        platform,
        source: 'playstation',
        externalId,
        canonicalId: canonicalId ?? null,
        coverUrl,
        boxArtUrl,
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
  }
  return { added, updated, total: trophyTitles.length };
}

/**
 * POST /api/playstation/sync
 * Body: { npsso: string, rememberForAutoSync?: boolean }
 * Exchanges NPSSO for PSN auth, fetches user's trophy titles (games) via getUserTitles, and syncs them to the library.
 */
router.post('/sync', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const npsso = (req.body?.npsso as string)?.trim();
    const rememberForAutoSync = Boolean(req.body?.rememberForAutoSync);
    if (!npsso) {
      return res.status(400).json({
        error: 'NPSSO token required. Log in at playstation.com, then visit https://ca.account.sony.com/api/v1/ssocookie and paste the "npsso" value here.',
      });
    }

    const accessCode = await exchangeNpssoForAccessCode(npsso);
    const auth = await exchangeAccessCodeForAuthTokens(accessCode);

    const result = await runPlaystationSyncForUser(userId, { accessToken: auth.accessToken });
    if (rememberForAutoSync && auth.refreshToken) {
      await db.update(users).set({ psnRefreshToken: auth.refreshToken }).where(eq(users.id, userId));
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'PlayStation sync failed';
    if (message.includes('NPSSO') || message.includes('access') || message.includes('401') || message.includes('403')) {
      return res.status(401).json({
        error: 'Invalid or expired NPSSO. Log in again at playstation.com, then get a fresh token from https://ca.account.sony.com/api/v1/ssocookie',
      });
    }
    res.status(500).json({ error: message });
  }
});

export default router;
