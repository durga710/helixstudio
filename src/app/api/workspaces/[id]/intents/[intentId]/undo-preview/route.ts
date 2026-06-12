/**
 * /api/workspaces/[id]/intents/[intentId]/undo-preview — POST: propose the
 * edits that revert one intent, WITHOUT applying anything. Mechanical where
 * possible (exact restore / inverse patch), AI untangle where later work
 * overlaps. The client shows the diff; apply happens via undo-apply.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { buildUndoProposal } from "@/lib/undo";
import { resolveAiPrefs } from "@/lib/ai-agent";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; intentId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id, intentId } = await params;
  const g = await guardWorkspace("undo.preview", id, { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  const intent = await db().workspaceIntent.findUnique({
    where: { id: intentId },
    include: { changes: true },
  });
  if (!intent || intent.workspaceId !== ws.id) return apiErrors.notFound("Intent");
  if (intent.status === "reverted") {
    return apiErrors.badRequest("This change has already been reverted.");
  }
  if (intent.changes.length === 0) {
    return apiErrors.badRequest("This change touched no files — nothing to undo.");
  }

  const ai = await resolveAiPrefs(user.id);
  const auth = await getGitAuth(ws.userId, ws.provider);
  const proposal = await withGitAuth(auth, () => buildUndoProposal(ws, intent, ai));

  if (proposal.tokensUsed > 0) {
    try {
      await db().user.update({
        where: { id: user.id },
        data: { tokensUsed: { increment: proposal.tokensUsed } },
      });
    } catch (e) {
      console.error("[undo-preview] metering failed", e);
    }
  }

  return ok({
    intent: { id: intent.id, title: intent.title, kind: intent.kind },
    entries: proposal.entries,
    unresolved: proposal.unresolved,
    baseHashes: proposal.baseHashes,
  });
}
