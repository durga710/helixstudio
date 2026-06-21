import "server-only";

/**
 * House-OpenAI → Bedrock fallback telemetry.
 *
 * When the house OpenAI key fails fatally and a turn (or any one-shot call)
 * retries on Bedrock GPT-OSS, we bump a counter + stamp the time so operators
 * can SEE whether the fallback is actually firing in prod via /api/health —
 * a quiet, recurring fallback usually means the OpenAI key is out of credits
 * or mis-modeled and needs attention.
 *
 * Redis-backed when configured (shared across serverless instances); otherwise
 * a per-instance in-memory counter (fine for local/single-instance). Recording
 * is fire-and-forget — telemetry must never slow or break a model call.
 */

import { getRedis } from "@/lib/redis";

const COUNT_KEY = "helix:house_fallback:count";
const LAST_KEY = "helix:house_fallback:last";

let memCount = 0;
let memLastAt: string | null = null;

/** Record that the house-OpenAI → Bedrock fallback fired. Fire-and-forget. */
export function recordHouseFallback(): void {
  memCount += 1;
  memLastAt = new Date().toISOString();
  const redis = getRedis();
  if (redis) {
    void redis.incr(COUNT_KEY).catch(() => {});
    void redis.set(LAST_KEY, memLastAt).catch(() => {});
  }
}

export interface HouseFallbackStats {
  /** Total fallbacks recorded (since the Redis key / instance start). */
  count: number;
  /** ISO timestamp of the most recent fallback, or null if none. */
  lastAt: string | null;
}

/** Read the fallback stats for /api/health. Redis when configured (shared
 *  across instances), else this instance's in-memory counters. */
export async function getHouseFallbackStats(): Promise<HouseFallbackStats> {
  const redis = getRedis();
  if (redis) {
    try {
      const [count, lastAt] = await Promise.all([
        redis.get<number>(COUNT_KEY),
        redis.get<string>(LAST_KEY),
      ]);
      return { count: Number(count ?? 0), lastAt: lastAt ?? null };
    } catch {
      // Redis hiccup — fall through to the in-memory view.
    }
  }
  return { count: memCount, lastAt: memLastAt };
}
