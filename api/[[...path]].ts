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
    const nodeReq = req as unknown as import('http').IncomingMessage;
    const nodeRes = res as unknown as import('http').ServerResponse;
    // Ensure Express sees the full path (Vercel may pass path without /api prefix)
    const path = nodeReq.url ?? req.url ?? '/';
    if (!path.startsWith('/api')) {
      nodeReq.url = '/api' + (path.startsWith('/') ? path : '/' + path);
    }
    return new Promise((resolve, reject) => {
      nodeRes.on('finish', () => resolve());
      nodeRes.on('error', reject);
      app(nodeReq, nodeRes);
    });
  } catch (err) {
    console.error('[api]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
}
