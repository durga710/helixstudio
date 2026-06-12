import "server-only";

import { getRedis } from "@/lib/redis";

/**
 * Live "what is the AI doing right now" channel. The chat turn publishes a
 * label per step (real tool activity, not theatre); the client polls it while
 * the turn runs.
 *
 * Uses shared Redis when configured so a turn running on one serverless
 * instance is visible to a poll that lands on another (otherwise the spinner
 * can hang). Falls back to an in-memory map for local/single-instance.
 *
 * PORTABILITY NOTE: the Redis path goes through src/lib/redis.ts (the only
 * Upstash-aware file). Moving to AWS/Azure Redis changes that file, not this
 * one. Writes are fire-and-forget — progress is best-effort UX, never worth
 * failing or slowing a turn.
 */

const STALE_MS = 5 * 60_000;
const TTL_SEC = 300;

const globalForProgress = globalThis as unknown as {
  helixProgress?: Map<string, { label: string; at: number }>;
};
const progress = (globalForProgress.helixProgress ??= new Map());

export function setProgress(workspaceId: string, label: string) {
  const redis = getRedis();
  if (redis) {
    void redis.set(`progress:${workspaceId}`, label, { ex: TTL_SEC }).catch(() => {});
    return;
  }
  progress.set(workspaceId, { label, at: Date.now() });
}

export async function getProgress(workspaceId: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    try {
      return (await redis.get<string>(`progress:${workspaceId}`)) ?? null;
    } catch {
      return null;
    }
  }
  const p = progress.get(workspaceId);
  if (!p || Date.now() - p.at > STALE_MS) return null;
  return p.label;
}

export function clearProgress(workspaceId: string) {
  const redis = getRedis();
  if (redis) {
    void redis.del(`progress:${workspaceId}`).catch(() => {});
    return;
  }
  progress.delete(workspaceId);
}
