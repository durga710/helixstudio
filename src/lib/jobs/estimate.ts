/**
 * Rough, pre-flight cost/scope estimate for a refactor job — shown in the confirm
 * offer so the user launches with eyes open. Pure + tested. It's deliberately a
 * RANGE: the real plan (and cost) is only known once the planner runs, so this
 * sets expectations from the request shape + project size, nothing more.
 */

export interface JobEstimate {
  files: number;
  workersLow: number;
  workersHigh: number;
  tokensLow: number;
  tokensHigh: number;
  note: string;
}

const TOKENS_PER_WORKER = 150_000; // a build-style turn, order of magnitude

export function estimateJob(request: string, fileCount: number): JobEstimate {
  const m = (request || "").toLowerCase();
  // Complexity hints push the worker count up.
  const bullets = (m.match(/(^|\n)\s*([-*•]|\d+[.)])\s+/g) || []).length;
  const broad = /\b(every|all|whole|entire|across|throughout)\b/.test(m);
  let high = 3;
  if (bullets >= 4) high += 2;
  if (broad) high += 2;
  if (fileCount > 40) high += 1;
  high = Math.min(8, high);
  const low = Math.max(2, Math.min(high, 2));

  return {
    files: fileCount,
    workersLow: low,
    workersHigh: high,
    tokensLow: low * TOKENS_PER_WORKER,
    tokensHigh: high * TOKENS_PER_WORKER,
    note: "Estimate only — the planner decides the real split. Counts against your token quota.",
  };
}

/** Compact human range, e.g. "~3–6 workers · ~450K–900K tokens". */
export function formatEstimate(e: JobEstimate): string {
  const k = (n: number) => `${Math.round(n / 1000)}K`;
  const w = e.workersLow === e.workersHigh ? `${e.workersLow}` : `${e.workersLow}–${e.workersHigh}`;
  return `~${w} worker${e.workersHigh === 1 ? "" : "s"} · ~${k(e.tokensLow)}–${k(e.tokensHigh)} tokens`;
}
