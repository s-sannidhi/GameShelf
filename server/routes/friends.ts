import { Router } from 'express';
import { db } from '../db/index';
import { users, games, friendships, friendRequests } from '../db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const rows = await db.select().from(friendships).where(or(eq(friendships.userId, userId), eq(friendships.friendId, userId)));
    const friendIds = [...new Set(rows.map((r) => (r.userId === userId ? r.friendId : r.userId)))];
    if (friendIds.length === 0) return res.json([]);
    const friends = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, friendIds));
    res.json(friends);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

router.post('/request', async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const { username } = req.body as { username?: string };
    if (!username?.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const [target] = await db.select().from(users).where(eq(users.username, username.trim())).limit(1);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === userId) return res.status(400).json({ error: 'Cannot add yourself' });
    const existingFriend = await db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.userId, userId), eq(friendships.friendId, target.id)),
          and(eq(friendships.userId, target.id), eq(friendships.friendId, userId))
        )
      )
      .limit(1);
    if (existingFriend.length > 0) return res.status(409).json({ error: 'Already friends' });
    const pending = await db
      .select()
      .from(friendRequests)
      .where(
        and(eq(friendRequests.fromUserId, userId), eq(friendRequests.toUserId, target.id), eq(friendRequests.status, 'pending'))
      )
      .limit(1);
    if (pending.length > 0) return res.status(409).json({ error: 'Request already sent' });
    const now = new Date().toISOString();
    const [reqRow] = await db
      .insert(friendRequests)
      .values({ fromUserId: userId, toUserId: target.id, status: 'pending', createdAt: now })
      .returning();
    res.status(201).json({ id: reqRow!.id, toUserId: target.id, username: target.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const list = await db
      .select({
        id: friendRequests.id,
        fromUserId: friendRequests.fromUserId,
        username: users.username,
        createdAt: friendRequests.createdAt,
      })
      .from(friendRequests)
      .innerJoin(users, eq(users.id, friendRequests.fromUserId))
      .where(and(eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

router.post('/requests/:id/accept', async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [reqRow] = await db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.id, id), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')))
      .limit(1);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    const now = new Date().toISOString();
    await db.update(friendRequests).set({ status: 'accepted' }).where(eq(friendRequests.id, id));
    await db.insert(friendships).values([
      { userId: reqRow.fromUserId, friendId: userId, createdAt: now },
      { userId, friendId: reqRow.fromUserId, createdAt: now },
    ]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to accept' });
  }
});

router.post('/requests/:id/decline', async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [reqRow] = await db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.id, id), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')))
      .limit(1);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    await db.update(friendRequests).set({ status: 'declined' }).where(eq(friendRequests.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to decline' });
  }
});

router.get('/:friendId/mutual-games', async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const friendId = parseInt(req.params.friendId, 10);
    if (isNaN(friendId)) return res.status(400).json({ error: 'Invalid friend ID' });
    const isFriend = await db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
          and(eq(friendships.userId, friendId), eq(friendships.friendId, userId))
        )
      )
      .limit(1);
    if (isFriend.length === 0) return res.status(403).json({ error: 'Not friends with this user' });
    const myGames = await db.select().from(games).where(eq(games.userId, userId));
    const theirGames = await db.select().from(games).where(eq(games.userId, friendId));
    const norm = (name: string) => name.trim().toLowerCase();
    const byName = new Map<string.unknown[]>();
    for (const g of myGames) {
      const key = norm(g.name);
      if (!byName.has(key)) byName.set(key, []);
      (byName.get(key) as unknown[]).push({ ...g, owner: 'me' });
    }
    const mutual: Array<{ name: string; coverUrl: string | null; releaseDate: string | null; id: number }> = [];
    for (const g of theirGames) {
      const key = norm(g.name);
      const mine = byName.get(key);
      if (mine && mine.length > 0) {
        mutual.push({
          id: (mine[0] as { id: number }).id,
          name: g.name,
          coverUrl: g.coverUrl,
          releaseDate: g.releaseDate,
        });
      }
    }
    res.json(mutual);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get mutual games' });
  }
});

export default router;
