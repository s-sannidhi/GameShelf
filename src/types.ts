export interface User {
  id: number;
  username: string;
  email: string;
  steamId?: string | null;
  psnLinked?: boolean;
}

export interface Game {
  id: number;
  userId?: number;
  externalId: string | null;
  canonicalId: string | null;
  name: string;
  platform: string;
  source: string;
  coverUrl: string | null;
  boxArtUrl: string | null;
  screenshots: string | null; // JSON array of URLs
  description: string | null;
  releaseDate: string | null;
  genres: string | null;
  playtimeMinutes: number | null;
  completedAt: string | null;
  rating: number | null;
  notes: string | null;
  storeUrl: string | null;
  developer: string | null;
  publisher: string | null;
  trailerUrl: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Friend {
  id: number;
  username: string;
}

export interface FriendRequest {
  id: number;
  fromUserId: number;
  username: string;
  createdAt: string;
}

export interface MutualGame {
  id: number;
  name: string;
  coverUrl: string | null;
  releaseDate: string | null;
}

export interface MetadataSearchResult {
  id: number | string;
  name: string;
  summary: string | null;
  releaseDate: string | null;
  coverUrl: string | null;
}
