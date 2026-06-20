/**
 * Pure parsers + shared types for the planner and reviewer model replies.
 * Dependency-free so they're unit-testable (planner.ts / reviewer.ts add the
 * server-only model calls around these).
 */

export interface PlannedTask {
  title: string;
  /** File globs this sub-task may edit (disjoint from siblings where possible). */
  scope: string[];
  instruction: string;
  acceptance?: string;
  /** Indices of sibling tasks that must finish first (enables parallel scheduling
   * of the rest). Omitted = no ordering constraint. */
  dependsOn?: number[];
}

export interface ReviewResult {
  ship: boolean;
  fixes: PlannedTask[];
  summary: string;
}

// One rework round, not two: a second review+rework cycle on a big project costs
// a worker-batch's worth of tokens for diminishing returns (round 2 usually just
// flags integration nits and ships anyway). Verify still runs at the end.
export const MAX_REWORK_ROUNDS = 1;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function toTask(t: Record<string, unknown>, fallbackTitle = ""): PlannedTask {
  const deps = Array.isArray(t.dependsOn)
    ? t.dependsOn.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0).slice(0, 12)
    : undefined;
  return {
    title: str(t.title, 120) || fallbackTitle,
    scope: Array.isArray(t.scope) ? t.scope.map((g) => String(g)).filter(Boolean).slice(0, 25) : [],
    instruction: str(t.instruction, 2000),
    acceptance: t.acceptance ? str(t.acceptance, 400) : undefined,
    ...(deps && deps.length ? { dependsOn: deps } : {}),
  };
}

/** Extract + validate the planner's JSON array of sub-tasks. */
export function parsePlan(text: string): PlannedTask[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(m[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .filter((t) => str(t.title, 1) && str(t.instruction, 1))
    .map((t) => toTask(t))
    .slice(0, 12);
}

/** Parse the reviewer's JSON verdict. Defaults to "ship" when unparseable so a
 * finished job can't get trapped in a rework loop on a bad reply. */
export function parseReview(text: string): ReviewResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { ship: true, fixes: [], summary: "" };
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return { ship: true, fixes: [], summary: "" };
  }
  const wantsShip = obj.ship === true || obj.verdict === "ship";
  const fixes = (Array.isArray(obj.fixes) ? obj.fixes : [])
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .filter((t) => str(t.instruction, 1))
    .map((t) => toTask(t, "Fix"))
    .slice(0, 8);
  return { ship: wantsShip && fixes.length === 0, fixes, summary: str(obj.summary, 400) };
}
