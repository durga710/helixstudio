import "server-only";

/**
 * Two-level read-through cache for hot server-side lookups.
 *
 *   L1 — per-instance memory (microseconds; survives HMR via globalThis)
 *   L2 — shared Redis (~30-80ms; survives across serverless instances)
 *
 * Serverless spreads traffic over many short-lived instances, so a purely
 * in-memory cache restarts cold with every new instance. L2 makes the first
 * hit on a fresh instance cheap too. When Redis isn't configured (local
 * dev), this degrades to L1-only — same behavior as before.
 *
 * Only put REBUILDABLE, NON-SECRET data here: values shared across
 * instances outlive any one process, and Redis is a second store to think
 * about in a breach model. (Git tokens, for example, deliberately stay in
 * the per-instance cache in src/lib/git.)
 */

import { getRedis } from "@/lib/redis";

interface MemEntry {
  at: number;
  ttlMs: number;
  data: unknown;
}

const globalMem = globalThis as unknown as { __helixServerCache?: Map<string, MemEntry> };
const mem = () => (globalMem.__helixServerCache ??= new Map<string, MemEntry>());

const L2_PREFIX = "cache:";
const MAX_MEM_ENTRIES = 500;

export async function cachedJson<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  opts?: {
    /** Return false to skip caching a result (e.g. an empty fallback that
     * shouldn't mask real data for a whole TTL). Default: cache everything. */
    cacheIf?: (value: T) => boolean;
  },
): Promise<T> {
  const m = mem();
  const hit = m.get(key);
  if (hit && Date.now() - hit.at < hit.ttlMs) return hit.data as T;

  const redis = getRedis();
  if (redis) {
    try {
      const fromL2 = await redis.get<T>(`${L2_PREFIX}${key}`);
      if (fromL2 !== null && fromL2 !== undefined) {
        m.set(key, { at: Date.now(), ttlMs, data: fromL2 });
        return fromL2;
      }
    } catch {
      // Redis blip — fall through to the loader; next call retries L2.
    }
  }

  const fresh = await load();
  if (opts?.cacheIf && !opts.cacheIf(fresh)) return fresh;

  m.set(key, { at: Date.now(), ttlMs, data: fresh });
  if (m.size > MAX_MEM_ENTRIES) {
    for (const k of Array.from(m.keys()).slice(0, MAX_MEM_ENTRIES / 2)) m.delete(k);
  }
  if (redis) {
    try {
      await redis.set(`${L2_PREFIX}${key}`, fresh, { px: ttlMs });
    } catch {
      // best-effort — L1 still has it
    }
  }
  return fresh;
}

/** Drop a key from both levels (call after a mutation that stales it). */
export async function dropCached(key: string): Promise<void> {
  mem().delete(key);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(`${L2_PREFIX}${key}`);
    } catch {
      // best-effort
    }
  }
}
