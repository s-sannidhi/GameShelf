import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

router.use(requireAuth);

function loadEnv(): void {
  const paths = [
    path.join(__dirname, '..', '..', '.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const envPath of paths) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const raw = fs.readFileSync(envPath, 'utf8');
      const parsed = dotenv.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        const key = k.trim();
        const val = typeof v === 'string' ? v.trim() : v;
        if (val) process.env[key] = val;
      }
      return;
    } catch {
      continue;
    }
  }
}

/** Steam CDN header image for an app (460x215). */
export function steamHeaderUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

/** 64-bit Steam IDs are 17 digits. */
export const STEAM_ID64_REGEX = /^\d{17}$/;

/**
 * Resolve profile URL or vanity name to 64-bit Steam ID using Steam's ResolveVanityURL API.
 * Accepts: full profile URL (profiles/123... or id/CustomName), or raw 64-bit ID, or vanity name.
 */
export async function resolveToSteamId64(apiKey: string, input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const profilesMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/i) ?? trimmed.match(/^(\d{17})$/);
  if (profilesMatch) return profilesMatch[1];

  let vanity = '';
  const idMatch = trimmed.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (idMatch) vanity = idMatch[1];
  else if (!/^\d+$/.test(trimmed)) vanity = trimmed;

  if (!vanity) return null;

  const url = new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('vanityurl', vanity);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as { response?: { steamid?: string; success?: number } };
  if (data.response?.success === 1 && data.response.steamid) return data.response.steamid;
  return null;
}

/** Normalize game name for duplicate matching: trim, lower, strip parentheticals and " - X" suffixes. */
function normalizeGameNameForMatch(name: string): string {
  let s = name.trim().toLowerCase();
  s = s.replace(/\s*[(\[][\d]{4}[)\]]\s*$/i, ''); // trailing (2022) or [2022]
  s = s.replace(/\s*-\s*(standard|digital|deluxe|edition|game of the year|goty|complete).*$/i, ''); // - Edition etc
  s = s.replace(/\s*[(\[].*[)\]]\s*$/g, ''); // any trailing (...)
  return s.trim() || name.trim().toLowerCase();
}

/** Run Steam library sync for a user with a resolved 64-bit Steam ID. Used by POST /sync and by auto-sync. */
export async function runSteamSyncForUser(
  userId: number,
  steamId64: string
): Promise<{ added: number; updated: number; total: number }> {
  loadEnv();
  const apiKey = (process.env.STEAM_API_KEY ?? process.env.steam_api_key)?.trim();
  if (!apiKey) throw new Error('Steam not configured');
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamid', steamId64);
  url.searchParams.set('format', 'json');
  url.searchParams.set('include_appinfo', '1');
  const apiRes = await fetch(url.toString());
  if (!apiRes.ok) throw new Error(`Steam API: ${await apiRes.text()}`);
  const data = (await apiRes.json()) as { response?: { games?: Array<{ appid: number; name: string; playtime_forever?: number }> } };
  const list = data.response?.games ?? [];
  const now = new Date().toISOString();
  const canonicalCache = new Map<string, string | null>();
  const igdbArtCache = new Map<string, string | null>();
  let userGames = await db.select().from(games).where(eq(games.userId, userId));
  let added = 0;
  let updated = 0;
  const mergedIds = new Set<number>();
  for (const g of list) {
    const externalId = String(g.appid);
    const steamCover = steamHeaderUrl(g.appid);
    const playtimeMinutes = g.playtime_forever ?? 0;
    let existing = await db.select().from(games).where(and(eq(games.userId, userId), eq(games.externalId, externalId), eq(games.source, 'steam')));
    let canonicalId: string | null = null;
    if (existing.length === 0) {
      const cacheKey = g.name.trim().toLowerCase();
      if (!canonicalCache.has(cacheKey)) {
        canonicalCache.set(cacheKey, await getCanonicalIdForGameName(g.name));
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
        const nameLower = g.name.trim().toLowerCase();
        let byName = nameLower
          ? await db
              .select()
              .from(games)
              .where(and(eq(games.userId, userId), sql`LOWER(trim(${games.name})) = ${nameLower}`))
          : [];
        if (byName.length === 0) {
          const norm = normalizeGameNameForMatch(g.name);
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
    let coverUrl = steamCover;
    let boxArtUrl = steamCover;
    const igdbCacheKey = `${g.name.trim().toLowerCase()}\n${canonicalId ?? ''}`;
    if (!igdbArtCache.has(igdbCacheKey)) {
      igdbArtCache.set(igdbCacheKey, await getIgdbBoxArtForGame(g.name, canonicalId));
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
          name: g.name,
          coverUrl: keepCover ? existingGame.coverUrl : coverUrl,
          boxArtUrl: keepBoxArt ? existingGame.boxArtUrl : boxArtUrl,
          playtimeMinutes: (playtimeMinutes || existingGame.playtimeMinutes) ?? null,
          externalId,
          source: 'steam',
          platform: 'Steam',
          ...(canonicalId && { canonicalId }),
          updatedAt: now,
        })
        .where(eq(games.id, existingGame.id));
      updated++;
    } else {
      await db.insert(games).values({
        userId,
        name: g.name,
        platform: 'Steam',
        source: 'steam',
        externalId,
        canonicalId: canonicalId ?? null,
        coverUrl,
        boxArtUrl,
        playtimeMinutes: playtimeMinutes || null,
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
  }
  return { added, updated, total: list.length };
}

/**
 * GET /api/steam/owned-games?steamid= optional
 * Returns list of games from Steam GetOwnedGames. Uses STEAM_API_KEY and STEAM_ID (or query steamid).
 */
router.get('/owned-games', async (req, res) => {
  try {
    loadEnv();
    const apiKey = (process.env.STEAM_API_KEY ?? process.env.steam_api_key)?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'Steam not configured. Add STEAM_API_KEY to .env (get one at steamcommunity.com/dev/apikey, domain can be localhost).',
      });
    }
    const raw = (req.query.steamid as string)?.trim() || process.env.STEAM_ID?.trim() || process.env.steam_id?.trim();
    if (!raw) {
      return res.status(400).json({
        error: 'Steam ID or profile URL required. Pass ?steamid= with your 64-bit ID or paste your Steam profile link (steamcommunity.com/id/YourName or .../profiles/7656...).',
      });
    }
    const steamId = STEAM_ID64_REGEX.test(raw) ? raw : await resolveToSteamId64(apiKey, raw);
    if (!steamId) {
      return res.status(400).json({
        error: 'Could not resolve Steam ID. Use your full profile URL (steamcommunity.com/id/YourName) or your 17-digit 64-bit ID.',
      });
    }
    const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamid', steamId);
    url.searchParams.set('format', 'json');
    url.searchParams.set('include_appinfo', '1');
    const apiRes = await fetch(url.toString());
    if (!apiRes.ok) {
      const text = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Steam API: ${text.slice(0, 200)}` });
    }
    const data = (await apiRes.json()) as { response?: { games?: Array<{ appid: number; name: string; playtime_forever?: number; img_icon_url?: string }> } };
    const list = data.response?.games ?? [];
    const out = list.map((g) => ({
      appId: g.appid,
      name: g.name,
      playtimeMinutes: g.playtime_forever ?? 0,
      coverUrl: steamHeaderUrl(g.appid),
    }));
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Steam request failed' });
  }
});

/**
 * POST /api/steam/sync
 * Body: { steamid?: string }
 * Fetches owned games from Steam and adds/updates them in the user's library (source=Steam, platform=Steam).
 */
router.post('/sync', async (req, res) => {
  try {
    loadEnv();
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const apiKey = (process.env.STEAM_API_KEY ?? process.env.steam_api_key)?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'Steam not configured. Add STEAM_API_KEY to .env.',
      });
    }
    const raw = (req.body?.steamid as string)?.trim();
    const rememberForAutoSync = Boolean(req.body?.rememberForAutoSync);
    let steamId64: string;
    if (raw) {
      steamId64 = STEAM_ID64_REGEX.test(raw) ? raw : (await resolveToSteamId64(apiKey, raw)) ?? '';
      if (!steamId64) {
        return res.status(400).json({
          error: 'Could not resolve Steam ID. Use your full profile URL (steamcommunity.com/id/YourName) or your 17-digit 64-bit ID.',
        });
      }
      if (rememberForAutoSync) {
        await db.update(users).set({ steamId: steamId64 }).where(eq(users.id, userId));
      }
    } else {
      const userSteamQ = db.select({ steamId: users.steamId }).from(users).where(eq(users.id, userId));
      const [userRow] = await (userSteamQ as unknown as { limit(n: number): Promise<{ steamId: string | null }[]> }).limit(1);
      if (!userRow?.steamId?.trim()) {
        return res.status(400).json({
          error: 'Steam profile link or ID required. Paste your Steam profile URL (steamcommunity.com/id/YourName) or your 64-bit ID, or save one in Profile.',
        });
      }
      steamId64 = userRow.steamId.trim();
    }
    const result = await runSteamSyncForUser(userId, steamId64);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Steam sync failed' });
  }
});

export default router;
