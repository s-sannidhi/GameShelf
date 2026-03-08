import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../server/index.js';

let appPromise: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (!appPromise) appPromise = createApp();
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const app = await getApp();
    const nodeReq = req as unknown as import('http').IncomingMessage & { url?: string; headers?: Record<string, string | string[] | undefined> };
    const nodeRes = res as unknown as import('http').ServerResponse;
    // Rewrite sends /api/:path* to /api?__path=:path* so we get the path in query
    const pathSeg = (req.query?.__path as string) ?? '';
    const q = { ...req.query } as Record<string, string>;
    delete q.__path;
    const queryString = Object.keys(q).length ? '?' + new URLSearchParams(q).toString() : '';
    nodeReq.url = '/api/' + (pathSeg || '').replace(/\/$/, '') + queryString;
    return new Promise((resolve, reject) => {
      nodeRes.on('finish', () => resolve());
      nodeRes.on('error', reject);
      app(nodeReq, nodeRes);
    });
  } catch (err) {
    console.error('[api]', err);
    if (!res.headersSent) {
      const isProd = process.env.NODE_ENV === 'production';
      const message = isProd ? 'Server error' : (err instanceof Error ? err.message : 'Server error');
      res.status(500).json({ error: message });
    }
  }
}
