import type { Request, Response, NextFunction } from 'express';

export interface SessionUser {
  userId: number;
}

declare global {
  namespace Express {
    interface Session {
      userId?: number;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.userId == null) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  // Session may already be set; nothing to do
  next();
}
