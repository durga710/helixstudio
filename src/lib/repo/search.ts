/* Repository intelligence (Phase 2) — chunking + search.
 *
 * Files are chunked and scored with a lexical relevance function (term
 * frequency with position and filename boosts). With QDRANT_URL configured,
 * this is the swap point for embedding-backed semantic search; the in-memory
 * scorer keeps search fully functional without external services.
 */

import { activeWorkspace } from "@/lib/store";

export interface SearchHit {
  path: string;
  line: number;
  snippet: string;
  score: number;
}

interface Chunk {
  path: string;
  startLine: number;
  text: string;
}

function chunkFiles(): Chunk[] {
  const chunks: Chunk[] = [];
  for (const file of activeWorkspace().files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i += 8) {
      chunks.push({
        path: file.path,
        startLine: i + 1,
        text: lines.slice(i, i + 8).join("\n"),
      });
    }
  }
  return chunks;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 1);
}

export function searchRepo(query: string, limit = 8): SearchHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const chunk of chunkFiles()) {
    const haystack = chunk.text.toLowerCase();
    const pathLower = chunk.path.toLowerCase();
    let score = 0;
    for (const term of terms) {
      let idx = haystack.indexOf(term);
      while (idx !== -1) {
        score += 1;
        idx = haystack.indexOf(term, idx + term.length);
      }
      if (pathLower.includes(term)) score += 2;
    }
    if (score > 0) {
      const firstLine = chunk.text.split("\n").find((l) => {
        const ll = l.toLowerCase();
        return terms.some((t) => ll.includes(t));
      });
      hits.push({
        path: chunk.path,
        line: chunk.startLine,
        snippet: (firstLine ?? chunk.text.split("\n")[0] ?? "").trim().slice(0, 140),
        score,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
