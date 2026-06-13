import "server-only";

/**
 * Two-stage code retrieval for the agent's semantic_search tool.
 *
 *   Stage 1 — CANDIDATES: chunk files and lexically prefilter to a bounded
 *             set (free, fast — term frequency + filename boost).
 *   Stage 2 — RERANK: sort the candidates by true relevance to the query.
 *             Best signal wins, with graceful fallback:
 *               1. a dedicated reranker API if RERANK_API_URL/KEY are set
 *                  (Cohere/Jina/Voyage-style: documents in, {index,score} out),
 *               2. else the user's own chat model (no extra key needed),
 *               3. else just the lexical order (always works, zero cost).
 *
 * So the agent reads the RIGHT few files instead of a literal-match pile —
 * which matters most on large repos. Phase A: no embeddings, no vector DB.
 */

import { resolveAiPrefs, runOneShot } from "@/lib/ai-agent";
import { recordAiUsage } from "@/lib/ai-usage";
import { rankBm25, type Bm25Doc } from "./bm25";
import { embedRankChunks } from "@/lib/embeddings";

export interface Chunk {
  path: string;
  startLine: number;
  text: string;
}

export interface RankedHit {
  path: string;
  line: number;
  snippet: string;
}

const CHUNK_LINES = 14;
const PREFILTER = 40; // candidates handed to the reranker
const CHUNK_CHAR_CAP = 700; // per-chunk text sent to the reranker
const SNIPPET_LINES = 4;

/** Split files into overlapping-free line windows. */
export function buildChunks(files: { path: string; content: string }[]): Chunk[] {
  const chunks: Chunk[] = [];
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

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1);
}

/** Lexical relevance: query-term frequency in the chunk, with a filename boost. */
export function lexicalScore(queryTokens: string[], chunk: Chunk): number {
  const hayText = chunk.text.toLowerCase();
  const hayPath = chunk.path.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    let idx = 0;
    let n = 0;
    while ((idx = hayText.indexOf(t, idx)) >= 0) {
      n++;
      idx += t.length;
    }
    score += n;
    if (hayPath.includes(t)) score += 3; // a path hit is a strong signal
  }
  return score;
}

// ───────────────────────────────────────────────────────────────────────────
// PHASE B (SHIPPED, gated): embedding-based candidate generation lives in
// src/lib/embeddings.ts and is wired into selectCandidates() below. When
// SEMANTIC_EMBEDDINGS=1 and an OpenAI key is available, candidates are picked by
// MEANING (cosine over cached chunk embeddings) so "where users log in" finds
// authenticateSession() with no shared words. Otherwise this BM25 prefilter
// (keyword overlap, IDF-weighted) is the zero-cost default and fallback.
// ───────────────────────────────────────────────────────────────────────────

/** Top PREFILTER chunks by BM25 (IDF-weighted, length-normalized — far better
 *  than raw term frequency on big repos). Pads with leftovers (zero-score
 *  chunks rank last) so the reranker still has material when overlap is thin. */
function prefilter(query: string, chunks: Chunk[]): Chunk[] {
  const qTokens = tokenize(query);
  const docs: Bm25Doc[] = chunks.map((c) => ({ tokens: tokenize(c.text), pathTokens: tokenize(c.path) }));
  const hits = rankBm25(qTokens, docs);
  // Stable tie-break (BM25 ties — esp. the zero-score pad — by shorter path).
  hits.sort((a, b) => b.score - a.score || chunks[a.index].path.length - chunks[b.index].path.length || a.index - b.index);
  return hits.slice(0, PREFILTER).map((h) => chunks[h.index]);
}

/** Stage-2 option 1: a dedicated reranker endpoint (env-configured). */
async function dedicatedRerank(query: string, docs: string[], topN: number): Promise<number[] | null> {
  const url = process.env.RERANK_API_URL;
  const key = process.env.RERANK_API_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.RERANK_MODEL ?? "rerank", query, documents: docs, top_n: topN }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { index?: number }[] };
    const order = (data.results ?? []).map((r) => r.index).filter((i): i is number => typeof i === "number");
    return order.length ? order : null;
  } catch {
    return null;
  }
}

/** Stage-2 option 2: rank with the user's own chat model — no extra key. */
async function llmRerank(userId: string, query: string, docs: string[], topN: number): Promise<number[] | null> {
  const ai = await resolveAiPrefs(userId);
  const system =
    "You rank code snippets by how well they answer a developer's search. " +
    `Reply with ONLY a JSON array of the snippet numbers (their [n] labels), most relevant first, at most ${topN} entries. ` +
    "No prose, no code fences — just the array, e.g. [3,1,7].";
  const user = `SEARCH: ${query}\n\nSNIPPETS:\n${docs.map((d, i) => `[${i + 1}]\n${d}`).join("\n\n")}`;
  const r = await runOneShot({ ...ai, system, user, maxTokens: 200 });
  if ("error" in r) return null;
  // Meter the rerank spend like every other AI call (keeps limits honest).
  await recordAiUsage({
    userId,
    tokens: r.tokensUsed,
    kind: "rerank",
    provider: ai.provider,
    model: ai.model,
  });
  const m = /\[[\d,\s]*\]/.exec(r.text);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]) as unknown[];
    return arr
      .filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= docs.length)
      .map((n) => n - 1);
  } catch {
    return null;
  }
}

/**
 * Stage-1 candidates: embedding cosine similarity when enabled (finds code by
 * MEANING), else the BM25 lexical prefilter. Either way the candidates flow into
 * the same Stage-2 reranker below.
 */
async function selectCandidates(opts: {
  userId: string;
  workspaceId: string;
  query: string;
  chunks: Chunk[];
}): Promise<Chunk[]> {
  const ranked = await embedRankChunks({
    userId: opts.userId,
    workspaceId: opts.workspaceId,
    query: opts.query,
    chunks: opts.chunks.map((c) => ({ path: c.path, startLine: c.startLine, text: c.text })),
    topK: PREFILTER,
  });
  if (ranked) return ranked.map((r) => opts.chunks[r.index]).filter((c): c is Chunk => Boolean(c));
  return prefilter(opts.query, opts.chunks); // BM25 fallback (disabled / no key)
}

/** Find the most relevant code for a natural-language query. */
export async function rerankSearch(opts: {
  userId: string;
  workspaceId: string;
  query: string;
  chunks: Chunk[];
  topN?: number;
}): Promise<{ hits: RankedHit[]; method: "reranker" | "model" | "lexical" }> {
  const topN = opts.topN ?? 8;
  const candidates = await selectCandidates(opts);
  if (candidates.length === 0) return { hits: [], method: "lexical" };

  const docs = candidates.map((c) => `${c.path}:${c.startLine}\n${c.text.slice(0, CHUNK_CHAR_CAP)}`);

  let method: "reranker" | "model" | "lexical" = "lexical";
  let order = await dedicatedRerank(opts.query, docs, topN);
  if (order) method = "reranker";
  if (!order) {
    order = await llmRerank(opts.userId, opts.query, docs, topN);
    if (order) method = "model";
  }
  const picked = order && order.length ? order.slice(0, topN) : candidates.map((_, i) => i).slice(0, topN);

  const seen = new Set<number>();
  const hits: RankedHit[] = [];
  for (const i of picked) {
    if (seen.has(i)) continue;
    seen.add(i);
    const c = candidates[i];
    if (!c) continue;
    hits.push({
      path: c.path,
      line: c.startLine,
      snippet: c.text.split("\n").slice(0, SNIPPET_LINES).join("\n").slice(0, 260),
    });
  }
  return { hits, method };
}
