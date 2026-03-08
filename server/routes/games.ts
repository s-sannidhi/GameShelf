import { Router } from 'express';
import { db } from '../db/index.js';
import { games } from '../db/schema.js';
import { eq, desc, asc, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import type { SessionWithUserId } from '../types/session.js';
import { getIgdbBoxArtForGame } from './metadata.js';
import { fetchSteamStoreArt } from './steam.js';

function getUserId(req: { session?: SessionWithUserId }): number | undefined {
  return (req.session as SessionWithUserId | undefined)?.userId;
}

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const sortBy = (req.query.sortBy as string) || 'name';
    const sortOrder = (req.query.sortOrder as string) || 'asc';
    const filter = req.query.filter as string;
    const platform = req.query.platform as string;

    const orderColumn =
      sortBy === 'completedAt'
        ? games.completedAt
        : sortBy === 'playtimeMinutes'
          ? games.playtimeMinutes
          : sortBy === 'releaseDate'
            ? games.releaseDate
            : games.name;
    const order = sortOrder === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const all = await db.select().from(games).where(eq(games.userId, userId)).orderBy(order);

    let filtered = all;
    if (filter === 'completed') {
      filtered = all.filter((g) => g.completedAt != null);
    } else if (filter === 'in_progress') {
      filtered = all.filter((g) => g.playtimeMinutes != null && g.playtimeMinutes > 0 && g.completedAt == null);
    } else if (filter === 'backlog') {
      filtered = all.filter((g) => !g.playtimeMinutes && !g.completedAt);
    }
    if (platform) {
      filtered = filtered.filter((g) => g.platform === platform);
    }

    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [game] = await db.select().from(games).where(and(eq(games.id, id), eq(games.userId, userId)));
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(game);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const body = req.body as {
      name: string;
      platform?: string;
      source?: string;
      externalId?: string;
      canonicalId?: string;
      coverUrl?: string;
      boxArtUrl?: string;
      spineCoverUrl?: string;
      screenshots?: string[];
      description?: string;
      releaseDate?: string;
      genres?: string;
      playtimeMinutes?: number;
      storeUrl?: string;
      developer?: string;
      publisher?: string;
      trailerUrl?: string;
      tags?: string;
    };
    if (!body.name?.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const now = new Date().toISOString();
    const canonicalId =
      body.canonicalId ??
      (typeof body.externalId === 'string' && /^(rawg|igdb):\d+/.test(body.externalId) ? body.externalId : null);
    const screenshotsVal =
      Array.isArray(body.screenshots) && body.screenshots.length > 0 ? JSON.stringify(body.screenshots) : null;
    const [inserted] = await db
      .insert(games)
      .values({
        userId,
        name: body.name.trim(),
        platform: body.platform || 'Other',
        source: body.source || 'manual',
        externalId: body.externalId ?? null,
        canonicalId,
        coverUrl: body.coverUrl ?? null,
        boxArtUrl: body.boxArtUrl ?? null,
        spineCoverUrl: body.spineCoverUrl ?? null,
        screenshots: screenshotsVal,
        description: body.description ?? null,
        releaseDate: body.releaseDate ?? null,
        genres: body.genres ?? null,
        playtimeMinutes: body.playtimeMinutes ?? null,
        completedAt: null,
        rating: null,
        notes: null,
        storeUrl: body.storeUrl ?? null,
        developer: body.developer ?? null,
        publisher: body.publisher ?? null,
        trailerUrl: body.trailerUrl ?? null,
        tags: body.tags ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    res.status(201).json(inserted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

/** PATCH /games/:id/refresh-art – Steam games: try Steam Store first (official art + screenshots); else IGDB/RAWG. */
router.patch('/:id/refresh-art', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [game] = await db.select().from(games).where(and(eq(games.id, id), eq(games.userId, userId)));
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const now = new Date().toISOString();
    let coverUrl: string | null = null;
    let boxArtUrl: string | null = null;
    let spineCoverUrl: string | null = null;
    let screenshotsJson: string | null = null;
    if (game.source === 'steam' && game.externalId != null && /^\d+$/.test(String(game.externalId).trim())) {
      const appId = parseInt(String(game.externalId), 10);
      const steamArt = await fetchSteamStoreArt(appId);
      if (steamArt) {
        coverUrl = steamArt.coverUrl;
        boxArtUrl = steamArt.boxArtUrl;
        spineCoverUrl = steamArt.spineCoverUrl;
        screenshotsJson = steamArt.screenshots.length > 0 ? JSON.stringify(steamArt.screenshots) : null;
      }
    }
    if (!coverUrl || !boxArtUrl) {
      const igdbArt = await getIgdbBoxArtForGame(game.name, game.canonicalId);
      if (igdbArt) {
        coverUrl = igdbArt;
        boxArtUrl = igdbArt;
      }
    }
    if (!coverUrl || !boxArtUrl) {
      return res.status(404).json({ error: 'No art found for this game. Try Steam store (if Steam game) or configure Twitch/IGDB or RAWG API in .env.' });
    }
    const [updated] = await db
      .update(games)
      .set({
        coverUrl,
        boxArtUrl,
        ...(spineCoverUrl != null && { spineCoverUrl }),
        ...(screenshotsJson != null && { screenshots: screenshotsJson }),
        updatedAt: now,
      })
      .where(and(eq(games.id, id), eq(games.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Game not found' });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to refresh art' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const body = req.body as Partial<{
      name: string;
      platform: string;
      coverUrl: string;
      boxArtUrl: string;
      spineCoverUrl: string;
      screenshots: string[];
      canonicalId: string;
      description: string;
      releaseDate: string;
      genres: string;
      playtimeMinutes: number;
      completedAt: string | null;
      rating: number | null;
      notes: string | null;
      storeUrl: string;
      developer: string;
      publisher: string;
      trailerUrl: string;
      tags: string;
    }>;
    const now = new Date().toISOString();
    const updateObj: Record<string, unknown> = { ...body, updatedAt: now };
    if (Array.isArray(body.screenshots)) {
      updateObj.screenshots = body.screenshots.length > 0 ? JSON.stringify(body.screenshots) : null;
    }
    const [updated] = await db
      .update(games)
      .set(updateObj as typeof games.$inferInsert)
      .where(and(eq(games.id, id), eq(games.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Game not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const existing = await db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.id, id), eq(games.userId, userId)));
    if (existing.length === 0) return res.status(404).json({ error: 'Game not found' });
    await db.delete(games).where(and(eq(games.id, id), eq(games.userId, userId)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

export default router;
