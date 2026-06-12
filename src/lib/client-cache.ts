"use client";

/**
 * SWR-lite: a tiny module-level cache for client components that fetch on
 * mount. Returning to a screen paints the last-known data INSTANTLY while a
 * background refetch replaces it — the difference between an app that feels
 * like a website and one that feels like a social feed.
 *
 * Memory-only by design: it lives for the SPA session (route switches keep
 * it; a hard reload starts clean), so no persistence or invalidation
 * ceremony is needed. Writers should still call dropCache() after mutations
 * they know stale the data.
 */

const store = new Map<string, { at: number; data: unknown }>();

const DEFAULT_MAX_AGE_MS = 5 * 60_000;

/** Last cached value for a key, or null when absent/expired. */
export function readCache<T>(key: string, maxAgeMs = DEFAULT_MAX_AGE_MS): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) {
    store.delete(key);
    return null;
  }
  return hit.data as T;
}

export function writeCache(key: string, data: unknown): void {
  store.set(key, { at: Date.now(), data });
  if (store.size > 500) {
    for (const k of Array.from(store.keys()).slice(0, 250)) store.delete(k);
  }
}

/** Drop every key starting with the prefix (e.g. one workspace's entries). */
export function dropCache(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
