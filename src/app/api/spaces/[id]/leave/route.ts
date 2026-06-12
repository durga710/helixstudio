/**
 * /api/spaces/[id]/leave — POST: a member leaves the Space. The owner can't
 * leave (they delete the Space instead). Leaving un-shares the member's
 * workspaces from this Space.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("space.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await db().space.findUnique({ where: { id }, select: { ownerId: true, name: true } });
  if (!space) return apiErrors.notFound("Space");
  if (space.ownerId === g.user.id) {
    return apiErrors.badRequest("You own this Space — delete it instead of leaving.");
  }

  await db().workspace.updateMany({ where: { spaceId: id, userId: g.user.id }, data: { spaceId: null } });
  const removed = await db().spaceMember.deleteMany({ where: { spaceId: id, userId: g.user.id } });
  if (removed.count > 0) {
    void recordSpaceEvent({
      spaceId: id,
      userId: g.user.id,
      actorName: actorNameOf(g.user),
      action: "left",
      target: space.name,
    });
  }
  return ok({ left: true });
}
