import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  steamId: text('steam_id'),
  psnRefreshToken: text('psn_refresh_token'),
  createdAt: text('created_at').notNull(),
});

export const games = sqliteTable('games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().default(1).references(() => users.id),
  externalId: text('external_id'),
  canonicalId: text('canonical_id'),
  name: text('name').notNull(),
  platform: text('platform').notNull().default('Other'),
  source: text('source').notNull().default('manual'),
  coverUrl: text('cover_url'),
  boxArtUrl: text('box_art_url'),
  description: text('description'),
  releaseDate: text('release_date'),
  genres: text('genres'),
  playtimeMinutes: integer('playtime_minutes'),
  completedAt: text('completed_at'),
  rating: integer('rating'),
  notes: text('notes'),
  storeUrl: text('store_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const friendships = sqliteTable('friendships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  friendId: integer('friend_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
});

export const friendRequests = sqliteTable('friend_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromUserId: integer('from_user_id').notNull().references(() => users.id),
  toUserId: integer('to_user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'), // pending | accepted | declined
  createdAt: text('created_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Friendship = typeof friendships.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
