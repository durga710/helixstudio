/**
 * /api/spaces/[id]/leave — POST: a member leaves the Space. The owner can't
 * leave (they delete the Space instead). Leaving un-shares the member's
 * workspaces from this Space.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("space.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await db().space.findUnique({ where: { id }, select: { ownerId: true } });
  if (!space) return apiErrors.notFound("Space");
  if (space.ownerId === g.user.id) {
    return apiErrors.badRequest("You own this Space — delete it instead of leaving.");
  }

  await db().workspace.updateMany({ where: { spaceId: id, userId: g.user.id }, data: { spaceId: null } });
  await db().spaceMember.deleteMany({ where: { spaceId: id, userId: g.user.id } });
  return ok({ left: true });
}
