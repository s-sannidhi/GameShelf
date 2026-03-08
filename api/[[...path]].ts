import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../server/index';

let appPromise: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (!appPromise) appPromise = createApp();
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const app = await getApp();
  return new Promise((resolve, reject) => {
    res.on('finish', () => resolve());
    res.on('error', reject);
    app(req as unknown as import('http').IncomingMessage, res as unknown as import('http').ServerResponse);
  });
}
