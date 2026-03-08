import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

/** Load .env from project root (try both path relative to this file and cwd) */
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
        if (val) {
          process.env[key] = val;
          // Also set RAWG_API_KEY if they used lowercase in .env
          if (key === 'rawg_api_key') process.env.RAWG_API_KEY = val;
          if (key === 'twitch_client_id') process.env.TWITCH_CLIENT_ID = val;
          if (key === 'twitch_client_secret') process.env.TWITCH_CLIENT_SECRET = val;
        }
      }
      return;
    } catch {
      continue;
    }
  }
}

/** IGDB cover image URL from image_id */
function igdbCoverUrl(imageId: string): string {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

/** IGDB screenshot image URL */
function igdbScreenshotUrl(imageId: string): string {
  return `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${imageId}.jpg`;
}

let igdbToken: { token: string; expiresAt: number } | null = null;

async function getIgdbAccessToken(): Promise<string | null> {
  loadEnv();
  const clientId = (process.env.TWITCH_CLIENT_ID ?? process.env.twitch_client_id)?.trim();
  const clientSecret = (process.env.TWITCH_CLIENT_SECRET ?? process.env.twitch_client_secret)?.trim();
  if (!clientId || !clientSecret) return null;
  if (igdbToken && igdbToken.expiresAt > Date.now() + 60000) return igdbToken.token;
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    const token = data.access_token;
    if (!token) return null;
    igdbToken = { token, expiresAt: Date.now() + (data.expires_in ?? 0) * 1000 };
    return token;
  } catch {
    return null;
  }
}

function igdbRequest(clientId: string, token: string, endpoint: string, body: string): Promise<unknown> {
  return fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body,
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`IGDB ${r.status}: ${r.statusText}`))));
}

/** Full IGDB search: returns list of { id, name, summary, releaseDate, coverUrl } for use when RAWG is not configured. */
async function searchIgdbFull(query: string): Promise<Array<{ id: number; name: string; summary: string | null; releaseDate: string | null; coverUrl: string | null }>> {
  const token = await getIgdbAccessToken();
  if (!token) return [];
  const clientId = (process.env.TWITCH_CLIENT_ID ?? process.env.twitch_client_id)?.trim();
  if (!clientId) return [];
  try {
    const safeQuery = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 100);
    const games = (await igdbRequest(
      clientId,
      token,
      'games',
      `search "${safeQuery}"; fields id,name,summary,first_release_date,cover; limit 20;`
    )) as Array<{ id: number; name?: string; summary?: string; first_release_date?: number; cover?: number }>;
    if (!games.length) return [];
    const coverIds = [...new Set(games.map((g) => g.cover).filter(Boolean))] as number[];
    let coverIdToImage = new Map<number, string>();
    if (coverIds.length > 0) {
      const covers = (await igdbRequest(
        clientId,
        token,
        'covers',
        `where id = (${coverIds.join(',')}); fields id,image_id;`
      )) as Array<{ id?: number; image_id?: string }>;
      for (const c of covers) {
        if (c.id != null && c.image_id) coverIdToImage.set(c.id, c.image_id);
      }
    }
    return games.map((g) => {
      const coverImg = g.cover != null ? coverIdToImage.get(g.cover) : undefined;
      const releaseDate =
        g.first_release_date != null
          ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
          : null;
      return {
        id: g.id,
        name: g.name ?? 'Unknown',
        summary: g.summary ?? null,
        releaseDate,
        coverUrl: coverImg ? igdbCoverUrl(coverImg) : null,
      };
    });
  } catch {
    return [];
  }
}

/** Fetch one game from IGDB by id; returns { boxArtUrl, screenshots }. */
export async function getGameIgdb(gameId: string): Promise<{ boxArtUrl: string | null; screenshots: string[] }> {
  const token = await getIgdbAccessToken();
  if (!token) return { boxArtUrl: null, screenshots: [] };
  const clientId = (process.env.TWITCH_CLIENT_ID ?? process.env.twitch_client_id)?.trim();
  if (!clientId) return { boxArtUrl: null, screenshots: [] };
  const id = parseInt(gameId, 10);
  if (isNaN(id)) return { boxArtUrl: null, screenshots: [] };
  try {
    const games = (await igdbRequest(
      clientId,
      token,
      'games',
      `where id = ${id}; fields cover,screenshots;`
    )) as Array<{ cover?: number; screenshots?: number[] }>;
    const game = games[0];
    if (!game) return { boxArtUrl: null, screenshots: [] };
    let boxArtUrl: string | null = null;
    if (game.cover != null) {
      const covers = (await igdbRequest(clientId, token, 'covers', `where id = ${game.cover}; fields image_id;`)) as Array<{ image_id?: string }>;
      if (covers[0]?.image_id) boxArtUrl = igdbCoverUrl(covers[0].image_id);
    }
    let screenshots: string[] = [];
    const shotIds = game.screenshots ?? [];
    if (shotIds.length > 0) {
      const shots = (await igdbRequest(
        clientId,
        token,
        'screenshots',
        `where id = (${shotIds.slice(0, 10).join(',')}); fields image_id;`
      )) as Array<{ image_id?: string }>;
      screenshots = shots.map((s) => (s.image_id ? igdbScreenshotUrl(s.image_id) : '')).filter(Boolean);
    }
    return { boxArtUrl, screenshots };
  } catch {
    return { boxArtUrl: null, screenshots: [] };
  }
}

/** Search IGDB by name and return map of normalized name -> cover URL (for enriching RAWG results). */
async function fetchIgdbCoversBySearch(query: string): Promise<Map<string, string>> {
  const token = await getIgdbAccessToken();
  if (!token) return new Map();
  const clientId = (process.env.TWITCH_CLIENT_ID ?? process.env.twitch_client_id)?.trim();
  if (!clientId) return new Map();
  try {
    const safeQuery = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 100);
    const games = (await igdbRequest(
      clientId,
      token,
      'games',
      `search "${safeQuery}"; fields name,cover; limit 20;`
    )) as Array<{ name?: string; cover?: number }>;
    const coverIds = [...new Set(games.map((g) => g.cover).filter(Boolean))] as number[];
    if (coverIds.length === 0) return new Map();
    const covers = (await igdbRequest(
      clientId,
      token,
      'covers',
      `where id = (${coverIds.join(',')}); fields id,image_id;`
    )) as Array<{ id?: number; image_id?: string }>;
    const coverIdToImage = new Map<number, string>();
    for (const c of covers) {
      if (c.id != null && c.image_id) coverIdToImage.set(c.id, c.image_id);
    }
    const byName = new Map<string, string>();
    for (const g of games) {
      const name = g.name?.trim();
      if (!name) continue;
      const coverImg = g.cover != null ? coverIdToImage.get(g.cover) : undefined;
      if (coverImg) byName.set(name.toLowerCase(), igdbCoverUrl(coverImg));
    }
    return byName;
  } catch {
    return new Map();
  }
}

/**
 * Resolve a game name to a canonical ID (rawg:X or igdb:X) using the configured metadata API.
 * Used by Steam/PlayStation sync to dedupe: same game from different sources updates one row.
 * Returns null if metadata not configured or no match.
 */
export async function getCanonicalIdForGameName(gameName: string): Promise<string | null> {
  loadEnv();
  const q = gameName.trim().slice(0, 100);
  if (!q) return null;
  const apiKey = (process.env.RAWG_API_KEY ?? process.env.rawg_api_key)?.trim();
  const hasTwitch =
    (process.env.TWITCH_CLIENT_ID ?? process.env.twitch_client_id)?.trim() &&
    (process.env.TWITCH_CLIENT_SECRET ?? process.env.twitch_client_secret)?.trim();

  const FETCH_TIMEOUT_MS = 5000;

  if (apiKey) {
    try {
      const url = new URL('https://api.rawg.io/api/games');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('search', q);
      url.searchParams.set('page_size', '1');
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: Array<{ id: number }> };
      const first = data.results?.[0];
      if (first != null) return `rawg:${first.id}`;
    } catch {
      return null;
    }
  }
  if (hasTwitch) {
    try {
      const list = await searchIgdbFull(q);
      const first = list[0];
      if (first != null) return `igdb:${first.id}`;
    } catch {
      return null;
    }
  }
  return null;
}

const FETCH_ART_TIMEOUT_MS = 6000;

/** Get RAWG cover/box art URL by name or canonicalId (rawg:123). Returns null if not configured or no match. */
async function getRawgBoxArtForGame(
  gameName: string,
  canonicalId: string | null
): Promise<string | null> {
  loadEnv();
  const apiKey = (process.env.RAWG_API_KEY ?? process.env.rawg_api_key)?.trim();
  if (!apiKey) return null;
  const q = gameName.trim().slice(0, 200);
  if (!q) return null;
  try {
    if (canonicalId?.startsWith('rawg:')) {
      const rawId = canonicalId.slice(5).trim();
      if (rawId) {
        const { boxArtUrl } = await fetchRawgGame(rawId, apiKey);
        return boxArtUrl ?? null;
      }
    }
    const url = new URL('https://api.rawg.io/api/games');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('search', q);
    url.searchParams.set('page_size', '1');
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_ART_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ id: number; background_image?: string }> };
    const first = data.results?.[0];
    return first?.background_image ?? null;
  } catch {
    return null;
  }
}

/**
 * Get box/cover art URL: tries IGDB first, then RAWG as fallback.
 * Used by Steam/PS sync and by refresh-art.
 * Returns null if no configured source returns art.
 */
export async function getIgdbBoxArtForGame(
  gameName: string,
  canonicalId: string | null
): Promise<string | null> {
  loadEnv();
  const hasTwitch =
    (process.env.TWITCH_CLIENT_ID ?? process.env.twitch_client_id)?.trim() &&
    (process.env.TWITCH_CLIENT_SECRET ?? process.env.twitch_client_secret)?.trim();
  const q = gameName.trim().slice(0, 200);
  if (!q) return null;

  let url: string | null = null;
  if (hasTwitch) {
    try {
      if (canonicalId?.startsWith('igdb:')) {
        const id = canonicalId.slice(5).trim();
        if (id) {
          const { boxArtUrl } = await getGameIgdb(id);
          url = boxArtUrl ?? null;
        }
      }
      if (!url) {
        const list = await searchIgdbFull(q);
        url = list[0]?.coverUrl ?? null;
      }
    } catch {
      // fall through to RAWG
    }
  }
  if (!url) {
    url = await getRawgBoxArtForGame(gameName, canonicalId);
  }
  return url ?? null;
}

/**
 * Metadata search: RAWG (if configured) or IGDB via Twitch (if configured).
 * At least one of RAWG_API_KEY or Twitch Client ID + Secret must be set.
 */
router.get('/search', async (req, res) => {
  try {
    loadEnv();
    const q = (req.query.q as string) ?? '';
    if (!q?.trim()) {
      return res.status(400).json({ error: 'Query "q" is required' });
    }
    const apiKey = (process.env.RAWG_API_KEY ?? process.env.rawg_api_key)?.trim();
    const hasTwitch =
      (process.env.TWITCH_CLIENT_ID ?? process.env.twitch_client_id)?.trim() &&
      (process.env.TWITCH_CLIENT_SECRET ?? process.env.twitch_client_secret)?.trim();

    if (apiKey && hasTwitch) {
      const [rawgData, igdbList] = await Promise.all([
        (async () => {
          const url = new URL('https://api.rawg.io/api/games');
          url.searchParams.set('key', apiKey);
          url.searchParams.set('search', q.trim());
          url.searchParams.set('page_size', '20');
          const searchRes = await fetch(url.toString());
          if (!searchRes.ok) return null;
          return (await searchRes.json()) as {
            results?: Array<{
              id: number;
              name: string;
              released?: string;
              background_image?: string;
              description?: string;
            }>;
          };
        })(),
        searchIgdbFull(q.trim()),
      ]);
      const rawgResults = (rawgData?.results ?? []).map((g) => ({
        id: `rawg:${g.id}` as const,
        name: g.name,
        summary: g.description ?? null,
        releaseDate: g.released ?? null,
        coverUrl: g.background_image ?? null,
      }));
      const igdbCovers = await fetchIgdbCoversBySearch(q.trim());
      const rawgWithCovers = igdbCovers.size > 0
        ? rawgResults.map((r) => {
            const igdbCover =
              igdbCovers.get(r.name.toLowerCase()) ??
              [...igdbCovers.entries()].find(([k]) => r.name.toLowerCase().includes(k) || k.includes(r.name.toLowerCase()))?.[1];
            return { ...r, coverUrl: igdbCover ?? r.coverUrl };
          })
        : rawgResults;
      const namesFromRawg = new Set(rawgResults.map((r) => r.name.toLowerCase()));
      const igdbOnly = igdbList.filter((g) => !namesFromRawg.has(g.name.toLowerCase()));
      const igdbMapped = igdbOnly.map((g) => ({
        id: `igdb:${g.id}` as const,
        name: g.name,
        summary: g.summary,
        releaseDate: g.releaseDate,
        coverUrl: g.coverUrl,
      }));
      const merged = [...rawgWithCovers, ...igdbMapped];
      return res.json(merged);
    }

    if (apiKey) {
      const url = new URL('https://api.rawg.io/api/games');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('search', q.trim());
      url.searchParams.set('page_size', '20');
      const searchRes = await fetch(url.toString());
      if (!searchRes.ok) {
        const text = await searchRes.text();
        return res.status(searchRes.status).json({ error: `RAWG API error: ${text.slice(0, 200)}` });
      }
      const data = (await searchRes.json()) as {
        results?: Array<{
          id: number;
          name: string;
          released?: string;
          background_image?: string;
          description?: string;
        }>;
      };
      const results = (data.results ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        summary: g.description ?? null,
        releaseDate: g.released ?? null,
        coverUrl: g.background_image ?? null,
      }));
      return res.json(results);
    }

    if (hasTwitch) {
      const results = await searchIgdbFull(q.trim());
      return res.json(results);
    }

    return res.status(503).json({
      error:
        'Metadata not configured. Add either RAWG_API_KEY (rawg.io) or TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (dev.twitch.tv/console for IGDB) to .env, then restart the server.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Metadata search failed',
    });
  }
});

async function fetchRawgGame(rawId: string, apiKey: string): Promise<{ boxArtUrl: string | null; screenshots: string[] }> {
  const gameUrl = `https://api.rawg.io/api/games/${encodeURIComponent(rawId)}?key=${apiKey}`;
  const gameRes = await fetch(gameUrl);
  if (!gameRes.ok) throw new Error('Not found');
  const data = (await gameRes.json()) as {
    background_image?: string;
    short_screenshots?: Array<{ image: string }>;
  };
  let screenshots: string[] = [];
  if (Array.isArray(data.short_screenshots)) {
    screenshots = data.short_screenshots.map((s) => s.image).filter(Boolean);
  }
  if (screenshots.length === 0) {
    const screenshotsUrl = `https://api.rawg.io/api/games/${encodeURIComponent(rawId)}/screenshots?key=${apiKey}`;
    const screenshotsRes = await fetch(screenshotsUrl);
    if (screenshotsRes.ok) {
      const screenshotsData = (await screenshotsRes.json()) as { results?: Array<{ image: string }> };
      if (Array.isArray(screenshotsData.results)) {
        screenshots = screenshotsData.results.map((s) => s.image).filter(Boolean);
      }
    }
  }
  return { boxArtUrl: data.background_image ?? null, screenshots };
}

/** Fetch one game: box art and screenshots. Id can be "rawg:123", "igdb:456", or plain numeric. */
router.get('/game/:id', async (req, res) => {
  try {
    loadEnv();
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Game id required' });
    const apiKey = (process.env.RAWG_API_KEY ?? process.env.rawg_api_key)?.trim();
    const hasTwitch =
      (process.env.TWITCH_CLIENT_ID ?? process.env.twitch_client_id)?.trim() &&
      (process.env.TWITCH_CLIENT_SECRET ?? process.env.twitch_client_secret)?.trim();

    const rawId = id.startsWith('rawg:') ? id.slice(5) : id.startsWith('igdb:') ? id.slice(5) : id;

    if (id.startsWith('igdb:') && hasTwitch) {
      const igdb = await getGameIgdb(rawId);
      return res.json(igdb);
    }
    if (id.startsWith('rawg:') && apiKey) {
      try {
        const out = await fetchRawgGame(rawId, apiKey);
        return res.json(out);
      } catch {
        return res.status(404).json({ error: 'Game not found' });
      }
    }

    if (apiKey) {
      try {
        const out = await fetchRawgGame(rawId, apiKey);
        return res.json(out);
      } catch {
        if (hasTwitch) {
          const igdb = await getGameIgdb(rawId);
          return res.json(igdb);
        }
        return res.status(404).json({ error: 'Game not found' });
      }
    }

    if (hasTwitch) {
      const igdb = await getGameIgdb(rawId);
      return res.json(igdb);
    }

    return res.status(503).json({
      error: 'Metadata not configured. Add RAWG_API_KEY or TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET to .env.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch game details' });
  }
});

export default router;
