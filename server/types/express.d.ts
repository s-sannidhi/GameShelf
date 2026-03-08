import type { Response } from 'express';

declare global {
  namespace Express {
    interface Response {
      json(body?: unknown): Response;
    }
  }
}

export {};
