import "server-only";

/**
 * BM25 — the ranking function behind Lucene/Elasticsearch. Unlike raw term
 * frequency, it (a) down-weights common terms via IDF (rare terms matter more)
 * and (b) normalizes for document length, so a short, on-topic chunk beats a
 * long one that merely repeats a common word. Pure, dependency-free, in-Node.
 *
 * Reused by code search (the semantic_search prefilter) and context ranking.
 */

export interface Bm25Doc {
  /** Tokenized document body. */
  tokens: string[];
  /** Tokenized path/identifier — a query term here is a strong signal. */
  pathTokens?: string[];
}

export interface Bm25Hit {
  index: number;
  score: number;
}

const K1 = 1.5; // term-frequency saturation
const B = 0.75; // length-normalization strength
const PATH_BOOST = 2; // added when a query term appears in the doc's path

/**
 * Rank `docs` against `queryTokens` by BM25 (highest first). Corpus statistics
 * (IDF, average length) are computed over `docs`, so pass the full candidate
 * set. Ties break by shorter path then original order for determinism.
 */
export function rankBm25(queryTokens: string[], docs: Bm25Doc[]): Bm25Hit[] {
  const N = docs.length;
  if (N === 0) return [];

  // One pass: per-doc term frequencies, document frequency per term, total length.
  const tfPerDoc: Map<string, number>[] = new Array(N);
  const df = new Map<string, number>();
  let totalLen = 0;
  for (let i = 0; i < N; i++) {
    const tf = new Map<string, number>();
    for (const tok of docs[i].tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    tfPerDoc[i] = tf;
    totalLen += docs[i].tokens.length;
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const avgdl = totalLen / N || 1;

  // IDF only for the (de-duped) query terms.
  const qTerms = Array.from(new Set(queryTokens));
  const idf = new Map<string, number>();
  for (const t of qTerms) {
    const n = df.get(t) ?? 0;
    idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
  }

  const hits: Bm25Hit[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const tf = tfPerDoc[i];
    const dl = docs[i].tokens.length || 1;
    const pathTokens = docs[i].pathTokens;
    let score = 0;
    for (const t of qTerms) {
      const f = tf.get(t) ?? 0;
      if (f > 0) {
        const w = idf.get(t) ?? 0;
        score += (w * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * dl) / avgdl));
      }
      if (pathTokens && pathTokens.includes(t)) score += PATH_BOOST;
    }
    hits[i] = { index: i, score };
  }
  hits.sort((a, b) => b.score - a.score || a.index - b.index);
  return hits;
}
