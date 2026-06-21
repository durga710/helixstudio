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
 * Semantic search is ON BY DEFAULT — it's the product's default retrieval.
 * It still needs an available OpenAI key (the user's own, else the admin
 * platform key); with no key, the caller falls back to the zero-cost BM25
 * prefilter. Set SEMANTIC_EMBEDDINGS=0 to force BM25 everywhere.
 */

import "server-only";

import OpenAI from "openai";
import { createHash } from "node:crypto";
import type { Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { resolveAiKey } from "@/lib/ai/keys";
import { isAdminEmail } from "@/lib/admin";
import { recordAiUsage } from "@/lib/ai-usage";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";

const MODEL = "text-embedding-3-small";
const EMBED_BATCH = 96;
const CHUNK_LINES = 14;
const PREWARM_MAX_CHUNKS = 600; // cap a connect-time index so a huge repo can't run away
const PREWARM_MAX_FILE_BYTES = 120_000;

/**
 * Semantic embeddings default ON. Returns false only when explicitly disabled
 * (SEMANTIC_EMBEDDINGS=0). Even when "on", embedRankChunks still no-ops to BM25
 * when no OpenAI key is resolvable — so this is safe to leave on by default.
 */
export function embeddingsEnabled(): boolean {
  return process.env.SEMANTIC_EMBEDDINGS !== "0";
}

/** Text files worth embedding (skip binaries, lockfiles, vendored, media). */
function isEmbeddable(path: string): boolean {
  if (/node_modules\/|\/\.git\//.test(path)) return false;
  if (/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)$)/.test(path)) return false;
  return /\.(jsx?|tsx?|mjs|cjs|py|rb|go|rs|java|php|css|scss|html|vue|svelte|md|mdx|json|ya?ml|sql|sh|toml)$/i.test(path);
}

/** 14-line windows, matching the search chunker (rerank.ts). */
function chunkFiles(files: { path: string; content: string }[]): EmbedChunk[] {
  const chunks: EmbedChunk[] = [];
  for (const f of files) {
    const lines = f.content.split("\n");
    if (lines.length === 1 && lines[0] === "") continue;
    for (let i = 0; i < lines.length; i += CHUNK_LINES) {
      const text = lines.slice(i, i + CHUNK_LINES).join("\n");
      if (text.trim()) chunks.push({ path: f.path, startLine: i + 1, text });
    }
  }
  return chunks;
}

/** Embeddings are OpenAI-specific: the user's openai key, else the admin env key. */
async function resolveOpenAiKey(userId: string): Promise<string | undefined> {
  const prefs = await db().userPreferences.findUnique({
    where: { userId },
    select: { openaiKey: true, user: { select: { email: true } } },
  });
  // Embeddings power semantic search and are cheap — exempt from the Helix
  // premium gate so free-tier search keeps working on the house key (premium:true).
  return resolveAiKey({ provider: "openai", userKey: prefs?.openaiKey ?? undefined, isAdmin: isAdminEmail(prefs?.user?.email), premium: true });
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

/**
 * Embed an entire workspace's files up front — the real "every file indexed the
 * moment you connect" pass. Runs in the background (after()) on IMPORT-workspace
 * creation, so by the time the user searches, the FileEmbedding cache is warm and
 * semantic search works without setup. Capped + key-gated + best-effort: no key
 * → no-op (search lazily embeds on demand instead); any error is swallowed.
 *
 * Returns the number of NEW chunks embedded, or null when disabled / no key.
 */
export async function prewarmWorkspaceEmbeddings(
  ws: Workspace,
  userId: string,
): Promise<{ embedded: number; chunks: number } | null> {
  if (!embeddingsEnabled()) return null;
  const key = await resolveOpenAiKey(userId);
  if (!key) return null;

  try {
    const gitAuth = await getGitAuth(userId, ws.provider);
    const tree = await withGitAuth(gitAuth, () => listWorkspaceFiles(ws)).catch(() => [] as { path: string }[]);
    const paths = tree.map((f) => f.path).filter(isEmbeddable);

    const files: { path: string; content: string }[] = [];
    for (const p of paths) {
      const content = await withGitAuth(gitAuth, () => readWorkspaceFile(ws, p)).catch(() => null);
      if (content != null && content.length <= PREWARM_MAX_FILE_BYTES) files.push({ path: p, content });
    }

    let chunks = chunkFiles(files);
    if (chunks.length > PREWARM_MAX_CHUNKS) chunks = chunks.slice(0, PREWARM_MAX_CHUNKS);
    if (chunks.length === 0) return { embedded: 0, chunks: 0 };

    const client = new OpenAI({ apiKey: key });
    const hashed = chunks.map((c) => ({ ...c, hash: hashOf(c.text) }));
    const uniqueHashes = Array.from(new Set(hashed.map((h) => h.hash)));

    // Skip chunks already cached (content-addressed) so a re-run is cheap.
    const cached = await db().fileEmbedding.findMany({
      where: { workspaceId: ws.id, chunkHash: { in: uniqueHashes } },
      select: { chunkHash: true },
    });
    const have = new Set(cached.map((r) => r.chunkHash));
    const missing = uniqueHashes.filter((h) => !have.has(h)).map((h) => hashed.find((x) => x.hash === h)!);

    let tokens = 0;
    let embedded = 0;
    for (let i = 0; i < missing.length; i += EMBED_BATCH) {
      const batch = missing.slice(i, i + EMBED_BATCH);
      const res = await client.embeddings.create({ model: MODEL, input: batch.map((b) => b.text) });
      tokens += res.usage?.total_tokens ?? 0;
      const rows = batch.map((b, j) => ({
        workspaceId: ws.id,
        path: b.path,
        chunkHash: b.hash,
        startLine: b.startLine,
        vector: JSON.stringify(res.data[j].embedding),
      }));
      await db().fileEmbedding.createMany({ data: rows, skipDuplicates: true }).catch(() => {});
      embedded += rows.length;
    }

    if (tokens > 0) {
      void recordAiUsage({ userId, tokens, kind: "embed", provider: "openai", model: MODEL, workspaceId: ws.id });
    }
    return { embedded, chunks: chunks.length };
  } catch {
    return null; // best-effort — search still embeds lazily on demand
  }
}
