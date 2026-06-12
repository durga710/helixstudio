import "server-only";

/**
 * Intentional undo — revert an idea, not a commit.
 *
 * Given a past intent (its per-file before/after snapshots), propose the
 * workspace edits that remove what it introduced while preserving later
 * work:
 *   exact  — nothing touched the file since: restore the before-content.
 *   patch  — later edits elsewhere in the file: apply the inverse hunks
 *            (jsdiff with fuzzFactor 0 — a context mismatch IS overlap).
 *   ai     — later edits overlap the intent's own lines (or the base was
 *            never captured): one no-tools model call untangles the file.
 *
 * Proposals never write. The user approves a preview diff, then applyUndo
 * re-verifies content hashes (409 on drift) and executes through the same
 * captured write path — so an undo is itself an intent, and undoable.
 */

import { createHash } from "node:crypto";
import { createPatch, applyPatch } from "diff";
import type { Workspace, WorkspaceIntent, WorkspaceChange } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { readWorkspaceFile, writeWorkspaceFiles, deleteWorkspaceFile } from "@/lib/workspace";
import { normalizeEol, pruneIntents } from "@/lib/intent-ledger";
import { runOneShot } from "@/lib/ai-agent";
import { MAX_FILE_CHARS } from "@/lib/repo-files";

/** Files the AI untangler will attempt per proposal — beyond this they're
 * reported unresolved rather than burning unbounded tokens. */
const MAX_AI_UNTANGLES = 8;

export interface UndoEntry {
  path: string;
  action: "write" | "delete";
  /** Live content at preview time (null = file absent) — the diff's left side. */
  current: string | null;
  /** Proposed content (null when action is "delete") — the diff's right side. */
  proposed: string | null;
  method: "exact" | "patch" | "ai";
  note?: string;
}

export interface UndoProposal {
  entries: UndoEntry[];
  unresolved: { path: string; reason: string }[];
  /** sha256 of each path's live content at preview time — apply re-checks
   * these so a workspace that moved on 409s instead of clobbering. */
  baseHashes: Record<string, string>;
  tokensUsed: number;
}

export function hashContent(content: string | null): string {
  return createHash("sha256")
    .update(content === null ? "\0absent" : normalizeEol(content))
    .digest("hex");
}

const UNTANGLE_SYSTEM =
  "You are performing a surgical revert. The user wants to remove one past change (\"the intent\") from a file " +
  "that has since been edited further. You will receive: the intent description, the file BEFORE the intent (A), " +
  "the file AFTER the intent (B), and the CURRENT file (C). Produce the full content of C with everything the " +
  "intent introduced (the A→B delta) removed, while preserving ALL work added after the intent (the B→C delta). " +
  "If removing the intent leaves later code referencing missing symbols, adapt minimally and note it in a " +
  "`// REVERT NOTE:` comment at the top. Output EXACTLY one fenced code block containing the complete resulting " +
  "file, or the single token DELETE_FILE if the file should no longer exist. No other prose.";

function parseUntangle(text: string): { content: string | null } | null {
  const trimmed = text.trim();
  if (trimmed === "DELETE_FILE") return { content: null };
  const fence = /```[\w-]*\r?\n([\s\S]*?)\r?\n?```/.exec(trimmed);
  if (!fence) return null;
  return { content: fence[1] };
}

/**
 * Build the revert proposal for one intent. Read-only: IMPORT-mode callers
 * wrap in withGitAuth (current content can come from the repo base).
 */
export async function buildUndoProposal(
  ws: Workspace,
  intent: WorkspaceIntent & { changes: WorkspaceChange[] },
  ai: { provider: string; model: string; apiKey?: string; baseUrl: string },
): Promise<UndoProposal> {
  const entries: UndoEntry[] = [];
  const unresolved: { path: string; reason: string }[] = [];
  const baseHashes: Record<string, string> = {};
  const conflicts: { change: WorkspaceChange; current: string | null; reason: string }[] = [];
  let tokensUsed = 0;

  for (const change of intent.changes) {
    const A = change.beforeContent === null ? null : normalizeEol(change.beforeContent);
    const B = change.afterContent === null ? null : normalizeEol(change.afterContent);
    const rawCurrent = await readWorkspaceFile(ws, change.path);
    const C = rawCurrent === null ? null : normalizeEol(rawCurrent);
    baseHashes[change.path] = hashContent(C);

    if (C === A || (C === null && A === null)) continue; // already reverted — nothing to do

    if (change.baseUnknown) {
      conflicts.push({ change, current: C, reason: "the content before this change wasn't captured" });
      continue;
    }
    if (C === B) {
      // Untouched since the intent — exact restore.
      entries.push({
        path: change.path,
        action: A === null ? "delete" : "write",
        current: C,
        proposed: A,
        method: "exact",
      });
      continue;
    }
    if (A !== null && B !== null && C !== null) {
      // Later edits exist — try the inverse patch (B→A) against C. One line
      // of context: enough to anchor each hunk exactly (fuzzFactor 0), small
      // enough that a later edit a few lines away doesn't read as overlap.
      const inverse = createPatch(change.path, B, A, undefined, undefined, { context: 1 });
      const patched = applyPatch(C, inverse, { fuzzFactor: 0 });
      if (patched !== false) {
        entries.push({
          path: change.path,
          action: "write",
          current: C,
          proposed: patched,
          method: "patch",
          note: "later edits preserved; inverse hunks applied cleanly",
        });
        continue;
      }
      conflicts.push({ change, current: C, reason: "later changes overlap the lines this change touched" });
      continue;
    }
    if (A === null) {
      conflicts.push({ change, current: C, reason: "created by this change but edited since" });
    } else {
      conflicts.push({ change, current: C, reason: "deleted by this change but recreated since" });
    }
  }

  // AI untangle for the conflicted files (bounded).
  for (let i = 0; i < conflicts.length; i++) {
    const { change, current, reason } = conflicts[i];
    if (i >= MAX_AI_UNTANGLES) {
      unresolved.push({ path: change.path, reason: `${reason} (too many conflicts — revert manually)` });
      continue;
    }
    const prompt =
      `INTENT TO REMOVE (${intent.kind}): ${intent.title}\n` +
      `USER REQUEST:\n${intent.userRequest.slice(0, 1500)}\n\n` +
      `FILE: ${change.path}\nCONFLICT: ${reason}\n\n` +
      `--- A: BEFORE the intent ---\n${change.beforeContent ?? "(file did not exist)"}\n\n` +
      `--- B: AFTER the intent ---\n${change.afterContent ?? "(file was deleted)"}\n\n` +
      `--- C: CURRENT ---\n${current ?? "(file does not exist)"}`;
    const result = await runOneShot({
      ...ai,
      system: UNTANGLE_SYSTEM,
      user: prompt.slice(0, 90_000),
      maxTokens: Math.min(32_000, Math.ceil((current?.length ?? MAX_FILE_CHARS) / 3) + 500),
    });
    if ("error" in result) {
      unresolved.push({ path: change.path, reason: `${reason}; AI untangle failed: ${result.error}` });
      continue;
    }
    tokensUsed += result.tokensUsed;
    const parsed = parseUntangle(result.text);
    if (!parsed) {
      unresolved.push({ path: change.path, reason: `${reason}; the model didn't return a usable file` });
      continue;
    }
    if (parsed.content !== null && parsed.content.length > MAX_FILE_CHARS) {
      unresolved.push({ path: change.path, reason: `${reason}; AI result exceeded the file size cap` });
      continue;
    }
    entries.push({
      path: change.path,
      action: parsed.content === null ? "delete" : "write",
      current,
      proposed: parsed.content,
      method: "ai",
      note: reason,
    });
  }

  return { entries, unresolved, baseHashes, tokensUsed };
}

export type ApplyUndoResult =
  | { changes: { written: string[]; deleted: string[] }; undoIntentId: string }
  | { conflict: string }
  | { error: string };

/**
 * Execute an approved proposal. Re-verifies every file's live hash against
 * the preview's (the TOCTOU guard), records the revert as a new "undo"
 * intent through the captured write path, and marks the target reverted.
 * IMPORT-mode callers wrap in withGitAuth.
 */
export async function applyUndo(
  ws: Workspace,
  target: WorkspaceIntent,
  body: {
    entries: { path: string; action: "write" | "delete"; proposed: string | null }[];
    baseHashes: Record<string, string>;
  },
): Promise<ApplyUndoResult> {
  for (const entry of body.entries) {
    const current = await readWorkspaceFile(ws, entry.path);
    if (hashContent(current) !== body.baseHashes[entry.path]) {
      return { conflict: `The workspace changed since the preview (${entry.path}) — preview again.` };
    }
  }

  let undoIntentId: string;
  try {
    const row = await db().workspaceIntent.create({
      data: {
        workspaceId: ws.id,
        kind: "undo",
        status: "final",
        title: `Undo: ${target.title}`.slice(0, 80),
        userRequest: `Undo the change "${target.title}" (intent ${target.id})`,
        revertsIntentId: target.id,
      },
      select: { id: true },
    });
    undoIntentId = row.id;
    void pruneIntents(ws.id);
  } catch (e) {
    console.error("[undo] intent create failed", e);
    return { error: "Couldn't record the undo — try again." };
  }

  const written: string[] = [];
  const deleted: string[] = [];
  const writes = body.entries.filter(
    (e): e is typeof e & { proposed: string } => e.action === "write" && e.proposed !== null,
  );
  if (writes.length) {
    const result = await writeWorkspaceFiles(
      ws,
      writes.map((e) => ({ path: e.path, content: e.proposed })),
      { intentId: undoIntentId },
    );
    if ("error" in result) return { error: result.error };
    written.push(...result.writtenPaths);
  }
  for (const entry of body.entries.filter((e) => e.action === "delete")) {
    const result = await deleteWorkspaceFile(ws, entry.path, { intentId: undoIntentId });
    if ("error" in result) return { error: result.error };
    deleted.push(...result.deletedPaths);
  }

  try {
    await db().workspaceIntent.update({ where: { id: target.id }, data: { status: "reverted" } });
  } catch (e) {
    console.error("[undo] revert mark failed", e);
  }

  return { changes: { written, deleted }, undoIntentId };
}
