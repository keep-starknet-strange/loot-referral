import type { NextRequest } from 'next/server';

type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number };

type Bucket = { count: number; resetAt: number };

const GLOBAL_BUCKETS_KEY = '__web_refer_rate_limit_buckets__';

function getBuckets(): Map<string, Bucket> {
  const g = globalThis as any;
  if (!g[GLOBAL_BUCKETS_KEY]) g[GLOBAL_BUCKETS_KEY] = new Map<string, Bucket>();
  return g[GLOBAL_BUCKETS_KEY] as Map<string, Bucket>;
}

export function getClientIp(request: NextRequest): string {
  // Try standard proxy headers first (Vercel/most CDNs)
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const ip = xff.split(',')[0]?.trim();
    if (ip) return ip;
  }

  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();

  // NextRequest doesn't reliably expose remote addr in all runtimes; fall back.
  return 'unknown';
}

export function rateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const { key, limit, windowMs } = params;
  const buckets = getBuckets();
  const now = Date.now();

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { ok: true, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}


