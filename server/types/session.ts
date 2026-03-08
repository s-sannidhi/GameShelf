/**
 * Session shape we use. Use this for type assertions so Vercel's TS (node16) sees it.
 */
export interface SessionWithUserId {
  userId?: number;
  destroy?(callback?: (err?: Error) => void): void;
}

export function getSessionUserId(session: SessionWithUserId | undefined): number | undefined {
  return session?.userId;
}
