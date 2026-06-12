/**
 * Rate limiter — fixed window. Uses shared Redis when configured (correct
 * across all serverless instances); otherwise an in-memory per-process map
 * (fine for local/dev and single-instance).
 *
 * PORTABILITY NOTE: the Redis path goes through src/lib/redis.ts, which is the
 * only Upstash-aware file. Moving to AWS/Azure Redis changes that one file,
 * not this one. See the note in redis.ts.
 */

import "server-only";

import { getRedis } from "@/lib/redis";

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

/** In-memory fixed window (the original behavior; also the fallback). */
function inMemory(key: string, limit: number, windowMs: number): RateLimitResult {
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
  return { success: true, remaining: limit - bucket.count, reset: bucket.resetAt, limit };
}

export async function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const { limit, windowMs } = options;
  const redis = getRedis();
  if (!redis) return inMemory(key, limit, windowMs);

  // Distributed fixed window: INCR the counter, set the window TTL on the
  // first hit. Two round-trips at most; reset is approximated as now+window
  // (precise enough for a Retry-After hint).
  try {
    const redisKey = `rl:${key}`;
    const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSec);
    const reset = Date.now() + windowMs;
    if (count > limit) return { success: false, remaining: 0, reset, limit };
    return { success: true, remaining: limit - count, reset, limit };
  } catch {
    // Redis blip: fail open to the in-memory limiter rather than blocking
    // everyone. Worse-case limiting reverts to per-instance until Redis is back.
    return inMemory(key, limit, windowMs);
  }
}
