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
    // Rewrite sends all /api/* here; preserve original path so Express can route (req.url may be /api after rewrite)
    let path = nodeReq.url ?? (req as { url?: string }).url ?? '/';
    const orig = (nodeReq.headers?.['x-vercel-original-url'] ?? nodeReq.headers?.['x-url']) as string | undefined;
    if (orig && (path === '/api' || path === '/api/')) path = orig;
    if (!path.startsWith('/api')) {
      nodeReq.url = '/api' + (path.startsWith('/') ? path : '/' + path);
    } else {
      nodeReq.url = path;
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
