/**
 * /api/workspaces/[id]/fork — POST: copy a workspace (yours, or a teammate's
 * shared one) into a NEW scratch workspace owned by you. This is how you build
 * on someone else's Space project. Read-guarded; the copy takes the files, not
 * the owner's git connection.
 */

import { ok } from "@/lib/api-response";
import { copyWorkspaceAsScratch } from "@/lib/workspace";
import { guardWorkspace } from "@/lib/route-helpers";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.fork", id, { limit: 30, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  const fork = await copyWorkspaceAsScratch(g.ws, g.user.id, `Copy of ${g.ws.name}`);
  // Feed: a teammate copying a shared project is worth announcing.
  if (g.ws.spaceId && !g.isOwner) {
    void recordSpaceEvent({
      spaceId: g.ws.spaceId,
      userId: g.user.id,
      actorName: actorNameOf(g.user),
      action: "forked",
      target: g.ws.name,
      targetId: g.ws.id,
    });
  }
  return ok(fork);
}
