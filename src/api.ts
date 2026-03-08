import type { Game, MetadataSearchResult, User, Friend, FriendRequest, MutualGame } from './types';

/** Base URL for API. Set VITE_API_URL when frontend is deployed separately (e.g. Vercel); leave unset when same-origin. */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const API = `${API_BASE}/api`;
const credentials: RequestCredentials = 'include';
const AUTH_TOKEN_KEY = 'auth_token';

function getAuthHeader(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const t = localStorage.getItem(AUTH_TOKEN_KEY);
  return t ? `Bearer ${t}` : undefined;
}

export function setAuthToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function get<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  const auth = getAuthHeader();
  if (auth) headers['Authorization'] = auth;
  const res = await fetch(`${API}${path}`, { credentials, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = getAuthHeader();
  if (auth) headers['Authorization'] = auth;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = getAuthHeader();
  if (auth) headers['Authorization'] = auth;
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
    credentials,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json();
}

async function del(path: string): Promise<void> {
  const headers: Record<string, string> = {};
  const auth = getAuthHeader();
  if (auth) headers['Authorization'] = auth;
  const res = await fetch(`${API}${path}`, { method: 'DELETE', credentials, headers });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
}

export const authApi = {
  me: () => get<User>('/auth/me'),
  register: (body: { username: string; email: string; password: string }) =>
    post<User>('/auth/register', body),
  login: (body: { email: string; password: string }) => post<User>('/auth/login', body),
  logout: () => post<void>('/auth/logout'),
  updateProfile: (body: { steamId?: string | null }) => patch<User>('/auth/me', body),
};

export const gamesApi = {
  list: (params?: { sortBy?: string; sortOrder?: string; filter?: string; platform?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return get<Game[]>(`/games${q ? `?${q}` : ''}`);
  },
  get: (id: number) => get<Game>(`/games/${id}`),
  create: (body: Partial<Game>) => post<Game>('/games', body),
  update: (id: number, body: Partial<Game>) => patch<Game>(`/games/${id}`, body),
  delete: (id: number) => del(`/games/${id}`),
  refreshArt: (id: number) => patch<Game>(`/games/${id}/refresh-art`, {}),
};

export const metadataApi = {
  search: (q: string) => get<MetadataSearchResult[]>(`/metadata/search?q=${encodeURIComponent(q)}`),
  getGame: (rawgId: string | number) =>
    get<{ boxArtUrl: string | null; screenshots: string[] }>(`/metadata/game/${encodeURIComponent(String(rawgId))}`),
};

export const steamApi = {
  ownedGames: (steamId?: string) =>
    get<Array<{ appId: number; name: string; playtimeMinutes: number; coverUrl: string }>>(
      `/steam/owned-games${steamId ? `?steamid=${encodeURIComponent(steamId)}` : ''}`
    ),
  /** Fetch official art, screenshots, and metadata from Steam Store by app ID (for any game, e.g. cross-platform). */
  getStoreArt: (appId: number) =>
    get<{
      boxArtUrl: string;
      coverUrl: string;
      screenshots: string[];
      description?: string | null;
      developer?: string | null;
      publisher?: string | null;
      releaseDate?: string | null;
      genres?: string | null;
      storeUrl?: string | null;
    }>(`/steam/store-art/${appId}`),
  sync: (steamId?: string, rememberForAutoSync?: boolean) =>
    post<{ added: number; updated: number; total: number }>(
      '/steam/sync',
      steamId ? { steamid: steamId, rememberForAutoSync } : {}
    ),
};

export const playstationApi = {
  sync: (npsso: string, rememberForAutoSync?: boolean) =>
    post<{ added: number; updated: number; total: number }>('/playstation/sync', { npsso, rememberForAutoSync }),
};

export const syncApi = {
  auto: () =>
    post<{
      steam?: { added: number; updated: number; total: number };
      playstation?: { added: number; updated: number; total: number };
      errors?: { steam?: string; playstation?: string };
    }>('/sync/auto'),
};

export const friendsApi = {
  list: () => get<Friend[]>('/friends'),
  request: (username: string) => post<{ id: number; toUserId: number; username: string }>('/friends/request', { username }),
  requests: () => get<FriendRequest[]>('/friends/requests'),
  acceptRequest: (id: number) => post<void>(`/friends/requests/${id}/accept`),
  declineRequest: (id: number) => post<void>(`/friends/requests/${id}/decline`),
  mutualGames: (friendId: number) => get<MutualGame[]>(`/friends/${friendId}/mutual-games`),
};
