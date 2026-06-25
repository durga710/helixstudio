/**
 * /api/workspaces/[id]/review — POST: AI review of the pending changes.
 * Builds a unified-ish diff text from the overlay (same data as /diff),
 * runs one no-tools reviewer call with the user's chat model, persists the
 * result as an assistant message, and returns it.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getGitAuth, withGitAuth, getProvider } from "@/lib/git";
import { getOverlay } from "@/lib/workspace";
import { runReviewer, resolveAiPrefs } from "@/lib/ai-agent";
import { brandProviderError } from "@/lib/ai/provider-errors";
import { guardWorkspace } from "@/lib/route-helpers";
import { checkTokenBudget } from "@/lib/token-budget";
import { aiUsageOps } from "@/lib/ai-usage";
import { err } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 60;

const DIFF_TEXT_CAP = 30_000;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("review", id, { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  const budget = await checkTokenBudget(user.id);
  if (!budget.ok) return err(budget.code, budget.error, 403);

  const overlay = await getOverlay(ws);
  if (overlay.files.length === 0 && overlay.deletions.length === 0) {
    return apiErrors.badRequest("Nothing to review — no changed files in this workspace.");
  }

  // Unified-ish diff text: full new content per file (the reviewer sees what
  // will ship), base shown only when it exists and the budget allows.
  const gitAuth = ws.mode === "IMPORT" ? await getGitAuth(user.id, ws.provider) : null;
  let diffText = "";
  for (const path of overlay.deletions) {
    diffText += `--- DELETED: ${path}\n\n`;
  }
  for (const f of overlay.files) {
    if (diffText.length > DIFF_TEXT_CAP) {
      diffText += `\n… (${overlay.files.length} files total — remainder omitted for length)\n`;
      break;
    }
    let header = `=== ${f.path} (new content) ===`;
    if (ws.mode === "IMPORT" && ws.repo) {
      const base = await withGitAuth(gitAuth, () =>
        getProvider(ws.provider).fetchRepoFileContent(ws.repo!, f.path, ws.baseBranch ?? undefined),
      ).catch(() => null);
      header = base ? `=== ${f.path} (MODIFIED — replaces the repo version) ===` : `=== ${f.path} (ADDED) ===`;
    }
    diffText += `${header}\n${f.content.slice(0, 12_000)}\n\n`;
  }

  const ai = await resolveAiPrefs(user.id);
  const result = await runReviewer({
    ...ai,
    diffText: diffText.slice(0, DIFF_TEXT_CAP + 2_000),
  });
  if ("error" in result) return apiErrors.badRequest(brandProviderError(result.error));

  // Into chat history so the review travels with the conversation.
  try {
    await db().$transaction([
      db().workspaceMessage.create({
        data: {
          workspaceId: ws.id,
          role: "assistant",
          content: result.text,
          actions: [{ tool: "review", label: "reviewed the pending changes" }],
        },
      }),
      ...aiUsageOps({
        userId: user.id,
        tokens: result.tokensUsed,
        kind: "review",
        provider: ai.provider,
        model: ai.model,
        workspaceId: ws.id,
      }),
    ]);
  } catch (e) {
    console.error("[helix-review] persist failed", e);
  }

  return ok({ text: result.text });
}
