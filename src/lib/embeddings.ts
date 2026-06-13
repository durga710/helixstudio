import "server-only";

/**
 * Semantic code search (Phase B) — embedding-based candidate generation.
 *
 * Ranks code chunks by EMBEDDING cosine similarity to a natural-language query,
 * so "where users log in" finds `authenticateSession()` even with no shared
 * words. Chunk vectors are cached in FileEmbedding, content-addressed by hash,
 * so only new/changed chunks are ever embedded (incremental; reused across
 * searches and turns). Works for SCRATCH and IMPORT workspaces because it embeds
 * at search time over whatever chunks the tool already read.
 *
 * Gated by SEMANTIC_EMBEDDINGS=1 AND an available OpenAI key (the user's own,
 * else the admin platform key). Returns null when unavailable so the caller
 * falls back to the zero-cost BM25 prefilter.
 */

import OpenAI from "openai";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { resolveAiKey } from "@/lib/ai/keys";
import { isAdminEmail } from "@/lib/admin";
import { recordAiUsage } from "@/lib/ai-usage";

const MODEL = "text-embedding-3-small";
const EMBED_BATCH = 96;

export function embeddingsEnabled(): boolean {
  return process.env.SEMANTIC_EMBEDDINGS === "1";
}

/** Embeddings are OpenAI-specific: the user's openai key, else the admin env key. */
async function resolveOpenAiKey(userId: string): Promise<string | undefined> {
  const prefs = await db().userPreferences.findUnique({
    where: { userId },
    select: { openaiKey: true, user: { select: { email: true } } },
  });
  return resolveAiKey({ provider: "openai", userKey: prefs?.openaiKey ?? undefined, isAdmin: isAdminEmail(prefs?.user?.email) });
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 40);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export interface EmbedChunk {
  path: string;
  startLine: number;
  text: string;
}

/**
 * Rank chunks by cosine similarity to the query. Returns top-K {index, score}
 * into the input array, or null when embeddings are disabled / no OpenAI key.
 */
export async function embedRankChunks(opts: {
  userId: string;
  workspaceId: string;
  query: string;
  chunks: EmbedChunk[];
  topK: number;
}): Promise<{ index: number; score: number }[] | null> {
  if (!embeddingsEnabled() || opts.chunks.length === 0) return null;
  const key = await resolveOpenAiKey(opts.userId);
  if (!key) return null;
  const client = new OpenAI({ apiKey: key });

  try {
    const hashed = opts.chunks.map((c) => ({ ...c, hash: hashOf(c.text) }));
    const uniqueHashes = Array.from(new Set(hashed.map((h) => h.hash)));

    const cached = await db().fileEmbedding.findMany({
      where: { workspaceId: opts.workspaceId, chunkHash: { in: uniqueHashes } },
      select: { chunkHash: true, vector: true },
    });
    const cache = new Map<string, number[]>();
    for (const r of cached) {
      try {
        cache.set(r.chunkHash, JSON.parse(r.vector) as number[]);
      } catch {
        /* skip a corrupt cache row */
      }
    }

    // Embed only the chunks we don't already have (by content hash).
    const missing = uniqueHashes.filter((h) => !cache.has(h)).map((h) => hashed.find((x) => x.hash === h)!);
    let tokens = 0;
    for (let i = 0; i < missing.length; i += EMBED_BATCH) {
      const batch = missing.slice(i, i + EMBED_BATCH);
      const res = await client.embeddings.create({ model: MODEL, input: batch.map((b) => b.text) });
      tokens += res.usage?.total_tokens ?? 0;
      const rows = batch.map((b, j) => ({
        workspaceId: opts.workspaceId,
        path: b.path,
        chunkHash: b.hash,
        startLine: b.startLine,
        vector: JSON.stringify(res.data[j].embedding),
      }));
      await db().fileEmbedding.createMany({ data: rows, skipDuplicates: true }).catch(() => {});
      batch.forEach((b, j) => cache.set(b.hash, res.data[j].embedding as number[]));
    }

    const qres = await client.embeddings.create({ model: MODEL, input: [opts.query] });
    tokens += qres.usage?.total_tokens ?? 0;
    const queryVec = qres.data[0].embedding as number[];

    if (tokens > 0) {
      void recordAiUsage({ userId: opts.userId, tokens, kind: "embed", provider: "openai", model: MODEL });
    }

    const scored = hashed.map((h, index) => {
      const vec = cache.get(h.hash);
      return { index, score: vec ? cosine(queryVec, vec) : -1 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, opts.topK);
  } catch {
    return null; // any failure → BM25 fallback
  }
}
