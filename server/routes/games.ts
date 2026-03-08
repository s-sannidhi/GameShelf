import { Router } from 'express';
import { db } from '../db/index.js';
import { games } from '../db/schema.js';
import { eq, desc, asc, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { getIgdbBoxArtForGame } from './metadata.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const userId = req.session!.userId!;
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
    const userId = req.session!.userId!;
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
    const userId = req.session!.userId!;
    const body = req.body as {
      name: string;
      platform?: string;
      source?: string;
      externalId?: string;
      canonicalId?: string;
      coverUrl?: string;
      boxArtUrl?: string;
      description?: string;
      releaseDate?: string;
      genres?: string;
      playtimeMinutes?: number;
      storeUrl?: string;
    };
    if (!body.name?.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const now = new Date().toISOString();
    const canonicalId =
      body.canonicalId ??
      (typeof body.externalId === 'string' && /^(rawg|igdb):\d+/.test(body.externalId) ? body.externalId : null);
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
        description: body.description ?? null,
        releaseDate: body.releaseDate ?? null,
        genres: body.genres ?? null,
        playtimeMinutes: body.playtimeMinutes ?? null,
        completedAt: null,
        rating: null,
        notes: null,
        storeUrl: body.storeUrl ?? null,
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

/** PATCH /games/:id/refresh-art – fetch IGDB box art and update game cover/boxArt. */
router.patch('/:id/refresh-art', async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [game] = await db.select().from(games).where(and(eq(games.id, id), eq(games.userId, userId)));
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const igdbArt = await getIgdbBoxArtForGame(game.name, game.canonicalId);
    if (!igdbArt) {
      return res.status(404).json({ error: 'No art found for this game. Configure Twitch/IGDB or RAWG API in .env.' });
    }
    const now = new Date().toISOString();
    const [updated] = await db
      .update(games)
      .set({ coverUrl: igdbArt, boxArtUrl: igdbArt, updatedAt: now })
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
    const userId = req.session!.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const body = req.body as Partial<{
      name: string;
      platform: string;
      coverUrl: string;
      boxArtUrl: string;
      canonicalId: string;
      description: string;
      releaseDate: string;
      genres: string;
      playtimeMinutes: number;
      completedAt: string | null;
      rating: number | null;
      notes: string | null;
      storeUrl: string;
    }>;
    const now = new Date().toISOString();
    const updateObj = { ...body, updatedAt: now };
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
    const userId = req.session!.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [deleted] = await db
      .delete(games)
      .where(and(eq(games.id, id), eq(games.userId, userId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Game not found' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

export default router;
