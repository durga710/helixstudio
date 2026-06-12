import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Shared key-value store (Redis), used by the rate limiter and the chat
 * progress channel so those work correctly across multiple serverless
 * instances instead of each instance keeping its own in-memory copy.
 *
 * Gated on env: when UPSTASH_REDIS_REST_URL/TOKEN are absent the callers fall
 * back to their in-memory behavior (fine for local/dev and single-instance).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PORTABILITY NOTE — read this before moving to AWS or Azure.
 *
 * This file is the ONLY place in the codebase that knows about Upstash. The
 * rest of the app talks to `rate-limit.ts` and `progress.ts`, which talk to
 * the small interface here — never to Upstash directly. That's deliberate:
 * swapping clouds means rewriting THIS file, nothing else.
 *
 *   • Moving to AWS ElastiCache / MemoryDB, or Azure Cache for Redis:
 *     those speak the standard Redis TCP protocol, NOT Upstash's REST API.
 *     Replace `@upstash/redis` with `ioredis`, build the client from a
 *     standard `REDIS_URL` connection string, and expose the same handful of
 *     methods we use (`incr`, `expire`, `ttl`, `get`, `set` with TTL, `del`).
 *     Keep it a module-level singleton (like the Prisma client) so serverless
 *     invocations reuse one connection.
 *
 *   • Staying multi-cloud / fully neutral: any managed Redis works. The data
 *     we keep here is ephemeral (rate-limit counters, progress strings) — there
 *     is nothing to migrate; just point at the new instance and the values
 *     rebuild themselves.
 *
 *   • The Upstash REST client (used here) is chosen because it avoids TCP
 *     connection exhaustion on serverless. If you switch to ioredis on a
 *     platform that pools connections (e.g. a long-lived container), that
 *     concern goes away.
 * ───────────────────────────────────────────────────────────────────────────
 */

let client: Redis | null | undefined;

// Accept either naming: UPSTASH_REDIS_REST_* (Upstash-direct) or KV_REST_API_*
// (what Vercel's Upstash/KV marketplace integration injects). Same REST
// endpoint + token either way.
function restUrl(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
}
function restToken(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
}

export function redisEnabled(): boolean {
  return Boolean(restUrl() && restToken());
}

/** The shared Redis client, or null when not configured (callers fall back). */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = restUrl();
  const token = restToken();
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}
