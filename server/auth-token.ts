import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createAuthToken(userId: number): string {
  const payload = JSON.stringify({ userId, exp: Date.now() + EXPIRY_MS });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyAuthToken(token: string): number | null {
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { userId: number; exp: number };
    if (Date.now() > payload.exp) return null;
    return payload.userId;
  } catch {
    return null;
  }
}
