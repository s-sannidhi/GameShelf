import { Router } from 'express';
import { db } from '../db/index.js';
import { users, games, friendships, friendRequests } from '../db/schema.js';
import { eq, and, or, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import type { SessionWithUserId } from '../types/session.js';

const router = Router();
router.use(requireAuth);

function getUserId(req: { session?: SessionWithUserId }): number | undefined {
  return (req.session as SessionWithUserId | undefined)?.userId;
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const rows = await db.select().from(friendships).where(or(eq(friendships.userId, userId), eq(friendships.friendId, userId)));
    const friendIds = [...new Set(rows.map((r) => (r.userId === userId ? r.friendId : r.userId)))];
    if (friendIds.length === 0) return (res as unknown as { json: (b: unknown) => void }).json([]);
    const friends = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, friendIds));
    (res as unknown as { json: (b: unknown) => void }).json(friends);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

router.post('/request', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const { username } = req.body as { username?: string };
    if (!username?.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const targetQ = db.select().from(users).where(eq(users.username, username.trim()));
    const [target] = await (targetQ as unknown as { limit(n: number): Promise<typeof users.$inferSelect[]> }).limit(1);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === userId) return res.status(400).json({ error: 'Cannot add yourself' });
    const existingFriendQ = db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.userId, userId), eq(friendships.friendId, target.id)),
          and(eq(friendships.userId, target.id), eq(friendships.friendId, userId))
        )
      );
    const existingFriend = await (existingFriendQ as unknown as { limit(n: number): Promise<typeof friendships.$inferSelect[]> }).limit(1);
    if (existingFriend.length > 0) return res.status(409).json({ error: 'Already friends' });
    const pendingQ = db
      .select()
      .from(friendRequests)
      .where(
        and(eq(friendRequests.fromUserId, userId), eq(friendRequests.toUserId, target.id), eq(friendRequests.status, 'pending'))
      );
    const pending = await (pendingQ as unknown as { limit(n: number): Promise<typeof friendRequests.$inferSelect[]> }).limit(1);
    if (pending.length > 0) return res.status(409).json({ error: 'Request already sent' });
    const now = new Date().toISOString();
    const [reqRow] = await db
      .insert(friendRequests)
      .values({ fromUserId: userId, toUserId: target.id, status: 'pending', createdAt: now })
      .returning();
    (res as unknown as { status: (code: number) => { json: (b: unknown) => void } }).status(201).json({ id: reqRow!.id, toUserId: target.id, username: target.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
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
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const acceptQ = db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.id, id), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')));
    const [reqRow] = await (acceptQ as unknown as { limit(n: number): Promise<typeof friendRequests.$inferSelect[]> }).limit(1);
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
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const declineQ = db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.id, id), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')));
    const [reqRow] = await (declineQ as unknown as { limit(n: number): Promise<typeof friendRequests.$inferSelect[]> }).limit(1);
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
    const userId = getUserId(req);
    if (userId == null) return res.status(401).json({ error: 'Not authenticated' });
    const friendId = parseInt(req.params.friendId, 10);
    if (isNaN(friendId)) return res.status(400).json({ error: 'Invalid friend ID' });
    const isFriendQ = db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
          and(eq(friendships.userId, friendId), eq(friendships.friendId, userId))
        )
      );
    const isFriend = await (isFriendQ as unknown as { limit(n: number): Promise<typeof friendships.$inferSelect[]> }).limit(1);
    if (isFriend.length === 0) return res.status(403).json({ error: 'Not friends with this user' });
    const myGames = await db.select().from(games).where(eq(games.userId, userId));
    const theirGames = await db.select().from(games).where(eq(games.userId, friendId));
    const norm = (name: string) => name.trim().toLowerCase();
    const byName = new Map<string, unknown[]>();
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
