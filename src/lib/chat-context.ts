/**
 * Deterministic chat-context compression — zero extra AI calls.
 *
 * The chat route used to resend the full file-path tree and 30 verbatim
 * messages every turn (~10k input tokens on a mature imported repo). This
 * module shrinks that to a stack line, a collapsed tree outline, a digest of
 * older turns (built from stored content + tool-action labels), and a short
 * verbatim window — with a hard input budget as the guardrail. Durable
 * decisions live in Workspace.notes, curated by the agent's `remember` tool.
 *
 * Pure functions over plain data: no DB, no fetch.
 */

import { detectFramework } from "@/lib/runner/types";

export const RECENT_VERBATIM = 8;
export const DIGEST_MAX = 1_500;
export const TREE_OUTLINE_MAX = 1_200;
export const NOTES_MAX = 2_000;
export const MAX_INPUT_CHARS = 24_000;

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface HistoryRow {
  role: string;
  content: string;
  actions: unknown; // [{tool, label}] JSON from WorkspaceMessage
}

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/* ----------------------------- stack line ----------------------------- */

/** One line of stack identity, e.g. "Stack: Next.js + tailwindcss + prisma". */
export function stackLine(paths: string[], pkgJson: string | null): string {
  const detection = detectFramework(paths, pkgJson);
  const extras: string[] = [];
  try {
    const pkg = JSON.parse(pkgJson ?? "{}") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const dep of ["tailwindcss", "prisma", "typescript", "express", "react"]) {
      if (deps[dep] && !detection.label.toLowerCase().includes(dep)) extras.push(dep);
    }
  } catch {
    // no parseable package.json — detection label stands alone
  }
  if (detection.kind === "python" && paths.includes("requirements.txt")) extras.push("requirements.txt");
  return `Stack: ${detection.label}${extras.length ? " + " + extras.join(" + ") : ""}`;
}

/* ---------------------------- tree outline ---------------------------- */

const ENTRY_FILES =
  /^(package\.json|next\.config\.[mc]?[jt]s|vite\.config\.[mc]?[jt]s|index\.html|tsconfig\.json|requirements\.txt|(app|main|server)\.py|src\/(main|index)\.[jt]sx?|app\/(page|layout)\.[jt]sx?)$/;

/**
 * Collapsed tree: root files individually, directories as "dir/ (N files)" to
 * depth 2, entry/config files always surfaced. Falls back to depth 1 when
 * over budget. The model gets the full listing on demand via list_files.
 */
export function treeOutline(paths: string[], maxChars = TREE_OUTLINE_MAX): string {
  if (paths.length === 0) return "(empty — nothing written yet)";

  const build = (depth: number): string => {
    const rootFiles: string[] = [];
    const dirCounts = new Map<string, number>();
    const entries: string[] = [];

    for (const p of paths) {
      if (ENTRY_FILES.test(p)) entries.push(p);
      const segs = p.split("/");
      if (segs.length === 1) {
        rootFiles.push(p);
      } else {
        const key = segs.slice(0, Math.min(depth, segs.length - 1)).join("/") + "/";
        dirCounts.set(key, (dirCounts.get(key) ?? 0) + 1);
      }
    }

    const lines: string[] = [];
    for (const [dir, count] of [...dirCounts.entries()].sort()) {
      lines.push(`${dir} (${count} file${count === 1 ? "" : "s"})`);
    }
    lines.push(...rootFiles.slice(0, 15).sort());
    if (rootFiles.length > 15) lines.push(`… ${rootFiles.length - 15} more root files`);
    const surfaced = entries.filter((e) => e.includes("/")).sort();
    if (surfaced.length > 0) lines.push(`key files: ${surfaced.join(", ")}`);
    lines.push("(full listing: list_files tool)");
    return lines.join("\n");
  };

  const two = build(2);
  if (two.length <= maxChars) return two;
  const one = build(1);
  return one.length <= maxChars ? one : one.slice(0, maxChars);
}

/* --------------------------- history context --------------------------- */

function actionSuffix(actions: unknown): string {
  if (!Array.isArray(actions) || actions.length === 0) return "";
  const labels = actions
    .map((a) => (a && typeof a === "object" && "label" in a ? String((a as { label: unknown }).label) : null))
    .filter((l): l is string => Boolean(l))
    .slice(0, 4);
  return labels.length ? ` [${labels.join("; ")}]` : "";
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

/**
 * Splits stored history (oldest→newest) into a compact digest of older turns
 * and a verbatim window of the most recent ones. Digest lines lean on the
 * stored tool-action labels, so "wrote 3 file(s): a, b, c" survives even
 * though the prose is truncated. Oldest digest lines drop first over budget.
 */
export function historyContext(
  rows: HistoryRow[],
  recentCount = RECENT_VERBATIM,
  digestMax = DIGEST_MAX,
): { digest: string; recent: ChatMsg[] } {
  const recentRows = rows.slice(-recentCount);
  const olderRows = rows.slice(0, Math.max(0, rows.length - recentCount));

  const lines = olderRows.map((m) =>
    m.role === "user"
      ? `user: ${oneLine(m.content, 120)}`
      : `assistant: ${oneLine(m.content, 160)}${actionSuffix(m.actions)}`,
  );
  while (lines.length > 0 && lines.join("\n").length > digestMax) lines.shift();
  if (olderRows.length > lines.length) lines.unshift(`(${olderRows.length - lines.length} earlier turns omitted)`);

  return {
    digest: lines.join("\n"),
    recent: recentRows.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  };
}

/* ---------------------------- budget guard ---------------------------- */

export const INSTRUCTIONS_MAX = 4_000;

export interface ContextParts {
  rules: string; // never trimmed
  workspaceMeta: string; // never trimmed
  stack: string;
  tree: string;
  notes: string; // never trimmed (already capped at NOTES_MAX)
  /** Repo's AGENTS.md/CLAUDE.md (capped at INSTRUCTIONS_MAX) — never trimmed. */
  instructionsDoc: string;
  digest: string;
  recent: ChatMsg[];
  userMessage: string; // never trimmed
  treePaths: string[]; // for rebuilding the outline at depth 1
}

/**
 * Hard input ceiling. Trim order: digest → tree (depth-1 rebuild) → verbatim
 * window down to 4 messages. Rules, notes, and the current message survive.
 */
export function fitBudget(parts: ContextParts): ContextParts {
  const size = (p: ContextParts) =>
    p.rules.length +
    p.workspaceMeta.length +
    p.stack.length +
    p.tree.length +
    p.notes.length +
    p.instructionsDoc.length +
    p.digest.length +
    p.recent.reduce((n, m) => n + m.content.length, 0) +
    p.userMessage.length;

  if (size(parts) <= MAX_INPUT_CHARS) return parts;
  parts = { ...parts, digest: "" };
  if (size(parts) <= MAX_INPUT_CHARS) return parts;
  parts = { ...parts, tree: treeOutline(parts.treePaths, 400) };
  if (size(parts) <= MAX_INPUT_CHARS) return parts;
  while (parts.recent.length > 4 && size(parts) > MAX_INPUT_CHARS) {
    parts = { ...parts, recent: parts.recent.slice(1) };
  }
  return parts;
}
