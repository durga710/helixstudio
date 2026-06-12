/**
 * /api/workspaces/[id]/intents/[intentId]/undo-apply — POST: execute an
 * approved undo proposal. Re-verifies the preview's content hashes (409 if
 * the workspace moved on), records the revert as a new "undo" intent, and
 * returns the change manifest so the editor refreshes.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { applyUndo } from "@/lib/undo";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const ApplySchema = z.object({
  entries: z
    .array(
      z.object({
        path: z.string().min(1).max(200),
        action: z.enum(["write", "delete"]),
        proposed: z.string().max(48_000).nullable(),
      }),
    )
    .min(1)
    .max(100),
  baseHashes: z.record(z.string(), z.string().length(64)),
});

type Params = { params: Promise<{ id: string; intentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id, intentId } = await params;
  const g = await guardWorkspace("undo.apply", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { ws } = g;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const intent = await db().workspaceIntent.findUnique({ where: { id: intentId } });
  if (!intent || intent.workspaceId !== ws.id) return apiErrors.notFound("Intent");
  if (intent.status === "reverted") {
    return apiErrors.badRequest("This change has already been reverted.");
  }

  const auth = await getGitAuth(ws.userId, ws.provider);
  const result = await withGitAuth(auth, () => applyUndo(ws, intent, parsed.data));

  if ("conflict" in result) return apiErrors.conflict(result.conflict);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok({ changes: result.changes, undoIntentId: result.undoIntentId });
}
