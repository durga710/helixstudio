import "server-only";

/**
 * Smart rolling conversation memory — the AI half of chat compaction.
 *
 * chat-context.ts compacts older turns deterministically (one truncated line
 * each, oldest dropped over budget). That forgets whatever scrolled off, not
 * whatever stopped mattering. This module folds aged-out turns into a persisted,
 * area-bucketed AI summary (with DONE / IN-PROGRESS markers) on Workspace —
 * keeping the project skeleton sharp while compressing finished work.
 *
 * It runs OUT OF BAND (scheduled via the chat route's `after()` once a reply has
 * streamed), so it never delays a turn, and only pays for a model call once a
 * full FOLD_BATCH of new older turns has accrued. The skeleton itself (live file
 * tree + Workspace.notes) is re-injected every turn and never lives here.
 *
 * Pairs with `composeDigest` + the `summarizedThrough` arg of `historyContext`:
 * the prompt shows this summary stacked above the deterministic digest of the
 * not-yet-folded gap, so nothing between folds is ever lost.
 */

import { db } from "@/lib/db";
import { resolveAiPrefs, runOneShotResilient } from "@/lib/ai-agent";
import { recordAiUsage } from "@/lib/ai-usage";
import { checkTokenBudget } from "@/lib/token-budget";
import { RECENT_VERBATIM, oneLine, actionSuffix } from "@/lib/chat-context";

/** Min new (un-summarized) older turns before a paid fold fires. */
export const FOLD_BATCH = 12;
/** Hard cap on the stored summary (chars) — matches the digest block budget. */
export const SUMMARY_MAX = 1_500;
/** Output budget for the summarizer call. */
const SUMMARY_OUTPUT_TOKENS = 600;
/** Char ceiling for the rendered batch fed to the summarizer (oldest dropped). */
const FOLD_INPUT_CHARS = 12_000;

const SUMMARIZER_SYSTEM =
  "You maintain a durable WORKING MEMORY for an AI coding agent across a long project. " +
  "You are given the memory-so-far and a batch of older conversation turns that are about to scroll out of the agent's live context. " +
  "Fold them into ONE updated memory. RULES:\n" +
  "- PRESERVE the project skeleton: architecture / MVC layout, what each area is for, key decisions, constraints, and stated user preferences.\n" +
  "- Track progress: mark each area DONE, IN-PROGRESS, or TODO.\n" +
  "- COMPRESS hard: for areas already DONE keep only the outcome (e.g. 'Backend: REST API done — auth + posts/comments endpoints'), not the step-by-step.\n" +
  "- Keep whatever is still being actively worked on detailed.\n" +
  "- Never invent; if unsure, keep it. Don't restate the live file tree — the agent already sees it.\n" +
  "- Organize under short area headings (e.g. Backend / Frontend / Database / Decisions / Open threads).\n" +
  `- Plain text only, no code fences, at most ${SUMMARY_MAX} characters.`;

interface FoldRow {
  role: string;
  content: string;
  actions: unknown;
  createdAt: Date;
}

function renderTurn(m: FoldRow): string {
  return m.role === "user"
    ? `user: ${oneLine(m.content, 200)}`
    : `assistant: ${oneLine(m.content, 240)}${actionSuffix(m.actions)}`;
}

/** Render the batch newest-priority, dropping oldest lines over the char budget. */
function renderBatch(rows: FoldRow[]): string {
  const lines = rows.map(renderTurn);
  while (lines.length > 1 && lines.join("\n").length > FOLD_INPUT_CHARS) lines.shift();
  return lines.join("\n");
}

/**
 * Stacks the persisted AI summary above the deterministic digest of the
 * not-yet-folded older turns. Either part may be empty.
 */
export function composeDigest(summary: string | null | undefined, unsummarizedDigest: string): string {
  const top = (summary ?? "").trim();
  const bottom = unsummarizedDigest.trim();
  if (!top) return bottom;
  if (!bottom) return top;
  return `${top}\n\n--- since then ---\n${bottom}`;
}

/**
 * Out-of-band incremental fold. A cheap no-op unless a full FOLD_BATCH of new
 * older turns has accumulated. Budget-metered; best-effort; never throws.
 */
export async function maybeCompactConversation(opts: { workspaceId: string; userId: string }): Promise<void> {
  try {
    const ws = await db().workspace.findUnique({
      where: { id: opts.workspaceId },
      select: { convoSummary: true, convoSummaryAt: true },
    });
    if (!ws) return;

    // Oldest→newest so we can isolate the "older than the live verbatim window
    // AND newer than what's already folded" batch.
    const rows = (await db().workspaceMessage.findMany({
      where: { workspaceId: opts.workspaceId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, actions: true, createdAt: true },
    })) as FoldRow[];

    const older = rows.slice(0, Math.max(0, rows.length - RECENT_VERBATIM));
    const since = ws.convoSummaryAt;
    const fresh = since ? older.filter((m) => m.createdAt > since) : older;
    if (fresh.length < FOLD_BATCH) return; // nothing worth a paid call yet

    if (!(await checkTokenBudget(opts.userId)).ok) return;
    const prefs = await resolveAiPrefs(opts.userId);
    if (!prefs.apiKey && prefs.provider !== "local") return; // no key → deterministic digest stands

    const user =
      (ws.convoSummary ? `MEMORY SO FAR:\n${ws.convoSummary}\n\n` : "") +
      `NEW OLDER TURNS (oldest first):\n${renderBatch(fresh)}`;

    const res = await runOneShotResilient({
      provider: prefs.provider,
      model: prefs.model,
      apiKey: prefs.apiKey,
      baseUrl: prefs.baseUrl,
      maxTokens: SUMMARY_OUTPUT_TOKENS,
      system: SUMMARIZER_SYSTEM,
      user,
    });
    if ("error" in res) return; // best-effort — the deterministic digest covers the gap
    const summary = res.text.trim().slice(0, SUMMARY_MAX);
    if (!summary) return;

    await db().workspace.update({
      where: { id: opts.workspaceId },
      data: { convoSummary: summary, convoSummaryAt: fresh[fresh.length - 1].createdAt },
    });
    void recordAiUsage({
      userId: opts.userId,
      tokens: res.tokensUsed,
      kind: "compaction",
      provider: prefs.provider,
      model: prefs.model,
      workspaceId: opts.workspaceId,
    });
  } catch (e) {
    console.error("[conversation-memory] fold failed", e);
  }
}
