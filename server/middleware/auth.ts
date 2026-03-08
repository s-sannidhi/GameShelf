import type { Request, Response, NextFunction } from 'express';
import type { SessionWithUserId } from '../types/session.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = (req.session as SessionWithUserId | undefined)?.userId;
  if (userId == null) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  // Session may already be set; nothing to do
  next();
}
