/**
 * Rate limiter — fixed-window in-memory map. Sufficient for a
 * single-instance Next.js deploy; per-instance limiting on serverless.
 * Interface matches Upstash's so a Redis swap is one file.
 */

import "server-only";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function purgeIfDue() {
  const now = Date.now();
  if (buckets.size < 256) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // ms epoch
  limit: number;
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): RateLimitResult {
  const { limit, windowMs } = options;
  const now = Date.now();

  purgeIfDue();

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, reset: now + windowMs, limit };
  }

  if (bucket.count >= limit) {
    return { success: false, remaining: 0, reset: bucket.resetAt, limit };
  }

  bucket.count += 1;
  return {
    success: true,
    remaining: limit - bucket.count,
    reset: bucket.resetAt,
    limit,
  };
}
