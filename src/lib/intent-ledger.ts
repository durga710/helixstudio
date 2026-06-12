import "server-only";

/**
 * Intent ledger — the provenance layer behind line blame ("why does this
 * line exist?") and intentional undo ("remove the invite feature").
 *
 * One WorkspaceIntent per user request that changed files (an agent build
 * turn, a manual editor save, or an applied undo), with per-file
 * before/after snapshots (WorkspaceChange) captured at the write chokepoint
 * in src/lib/workspace.ts.
 */

import { diffLines } from "diff";
import type { Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";

/** Newest intents kept per workspace; older ones (and their changes) are
 * pruned. Blame degrades gracefully: the oldest retained snapshot's before
 * becomes the new "base" attribution. */
export const MAX_INTENTS_PER_WORKSPACE = 200;

/** The chat panel sends approved plans as the build message with this exact
 * prefix (see chat-panel.tsx) — stripping it recovers the plan text. */
export const PLAN_EXEC_PREFIX = "Execute this approved plan exactly, step by step:\n\n";

export function deriveIntentTitle(text: string): string {
  const first = (text.trim().split("\n").find((l) => l.trim()) ?? "").trim();
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

/**
 * Create the intent for an agent build turn. Never throws — capture must
 * never break a turn — so callers treat null as "capture disabled".
 */
export async function createAgentIntent(
  ws: Workspace,
  userMessage: string,
): Promise<string | null> {
  try {
    const planText = userMessage.startsWith(PLAN_EXEC_PREFIX)
      ? userMessage.slice(PLAN_EXEC_PREFIX.length)
      : null;
    const row = await db().workspaceIntent.create({
      data: {
        workspaceId: ws.id,
        kind: "agent",
        title: deriveIntentTitle(planText ?? userMessage),
        userRequest: userMessage.slice(0, 4000),
        planText: planText?.slice(0, 12_000),
      },
      select: { id: true },
    });
    void pruneIntents(ws.id);
    return row.id;
  } catch (err) {
    console.error("[ledger] intent create failed", err);
    return null;
  }
}

/** Create the intent for a manual editor save/delete. Never throws. */
export async function createManualIntent(
  ws: Workspace,
  title: string,
): Promise<string | null> {
  try {
    const row = await db().workspaceIntent.create({
      data: {
        workspaceId: ws.id,
        kind: "manual",
        status: "final",
        title: deriveIntentTitle(title),
        userRequest: title,
      },
      select: { id: true },
    });
    void pruneIntents(ws.id);
    return row.id;
  } catch (err) {
    console.error("[ledger] intent create failed", err);
    return null;
  }
}

// ---------- Line blame ----------

/** Line attribution: an intent id, null for content that predates the ledger
 * (imported repo / trimmed history), or "uncaptured" for drift — edits that
 * bypassed capture. */
export type LineAttribution = string | null;

export interface LedgerRange {
  /** 1-based, inclusive. */
  start: number;
  end: number;
  intentId: LineAttribution | "uncaptured";
}

export interface LedgerIntentMeta {
  id: string;
  kind: string;
  status: string;
  title: string;
  createdAt: string;
  userRequest: string;
  planText: string | null;
  reasoning: string | null;
  alternatives: string | null;
  revertsIntentId: string | null;
  /** Every file this intent touched (the change set). */
  paths: string[];
}

export interface LineLedger {
  ranges: LedgerRange[];
  intents: Record<string, LedgerIntentMeta>;
  /** Test files that appear to protect this file (heuristic). */
  tests: string[];
}

export const normalizeEol = (s: string) => (s.includes("\r") ? s.replace(/\r\n/g, "\n") : s);

/** Line count matching jsdiff's diffLines tokenization ("a\nb\n" = 2 lines). */
function countLines(s: string): number {
  if (s === "") return 0;
  return s.split("\n").length - (s.endsWith("\n") ? 1 : 0);
}

/**
 * Blame by replay: walk the file's captured snapshots oldest-first, diffing
 * each step — added lines take that change's intent, surviving lines carry
 * their attribution forward. A final diff against the live content catches
 * drift (writes that bypassed capture) as "uncaptured". O(Σ snapshot sizes);
 * call it when the ledger UI asks, never per keystroke.
 *
 * IMPORT-mode callers must run inside withGitAuth (live content may come
 * from the repo base).
 */
export async function computeLineLedger(ws: Workspace, path: string): Promise<LineLedger> {
  const changes = await db().workspaceChange.findMany({
    where: { workspaceId: ws.id, path },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      intentId: true,
      beforeContent: true,
      afterContent: true,
      intent: {
        select: {
          id: true,
          kind: true,
          status: true,
          title: true,
          createdAt: true,
          userRequest: true,
          planText: true,
          reasoning: true,
          alternatives: true,
          revertsIntentId: true,
        },
      },
    },
  });

  const current = normalizeEol((await readWorkspaceFile(ws, path)) ?? "");

  let prev = changes.length ? (changes[0].beforeContent ?? "") : current;
  let attr: (string | null)[] = new Array(countLines(prev)).fill(null);

  const step = (target: string, label: string | null) => {
    const next: (string | null)[] = [];
    let pos = 0;
    for (const part of diffLines(prev, target)) {
      const n = part.count ?? 0;
      if (part.added) {
        for (let i = 0; i < n; i++) next.push(label);
      } else if (part.removed) {
        pos += n;
      } else {
        for (let i = 0; i < n; i++) next.push(attr[pos + i] ?? null);
        pos += n;
      }
    }
    attr = next;
    prev = target;
  };

  for (const c of changes) step(c.afterContent ?? "", c.intentId);
  // Drift self-heal: content the snapshots can't explain.
  if (prev !== current) step(current, "uncaptured");

  // Run-length encode into 1-based inclusive ranges.
  const ranges: LedgerRange[] = [];
  for (let i = 0; i < attr.length; i++) {
    const last = ranges[ranges.length - 1];
    if (last && last.intentId === attr[i] && last.end === i) last.end = i + 1;
    else ranges.push({ start: i + 1, end: i + 1, intentId: attr[i] });
  }

  // Metadata for every intent still owning at least one line, plus each
  // intent's full change set (its paths).
  const usedIds = Array.from(new Set(attr.filter((a): a is string => !!a && a !== "uncaptured")));
  const intentRows = new Map(changes.map((c) => [c.intentId, c.intent]));
  const pathRows = usedIds.length
    ? await db().workspaceChange.findMany({
        where: { intentId: { in: usedIds } },
        select: { intentId: true, path: true },
      })
    : [];
  const intents: Record<string, LedgerIntentMeta> = {};
  for (const id of usedIds) {
    const row = intentRows.get(id);
    if (!row) continue;
    intents[id] = {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      userRequest: row.userRequest,
      planText: row.planText,
      reasoning: row.reasoning,
      alternatives: row.alternatives,
      revertsIntentId: row.revertsIntentId,
      paths: pathRows.filter((p) => p.intentId === id).map((p) => p.path).sort(),
    };
  }

  const tests = await protectingTests(ws, path).catch(() => []);
  return { ranges, intents, tests };
}

export const TEST_FILE_RE = /(\.|_)(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//;

/**
 * Heuristic: which test files protect `path`? Test files that mention the
 * file's basename (sans extension). Bounded reads; best-effort.
 */
export async function protectingTests(ws: Workspace, path: string): Promise<string[]> {
  const base = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
  if (!base) return [];
  const tree = await listWorkspaceFiles(ws);
  const candidates = tree
    .filter((f) => TEST_FILE_RE.test(f.path) && f.path !== path)
    .slice(0, 20);
  const hits: string[] = [];
  for (const f of candidates) {
    const content = await readWorkspaceFile(ws, f.path).catch(() => null);
    if (content?.includes(base)) hits.push(f.path);
    if (hits.length >= 10) break;
  }
  return hits;
}

/** Keep only the newest MAX_INTENTS_PER_WORKSPACE intents (changes cascade). */
export async function pruneIntents(workspaceId: string): Promise<void> {
  try {
    const stale = await db().workspaceIntent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      skip: MAX_INTENTS_PER_WORKSPACE,
      select: { id: true },
    });
    if (stale.length === 0) return;
    await db().workspaceIntent.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
  } catch (err) {
    console.error("[ledger] prune failed", err);
  }
}
