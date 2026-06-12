/**
 * /api/spaces/[id]/activity — GET: the Space's recent activity (members only,
 * newest first, latest 50). Events are written fire-and-forget by the join /
 * share / assignment / push / fork / task routes via src/lib/space-events.ts.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("space.activity", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const member = await db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: id, userId: g.user.id } },
    select: { id: true },
  });
  if (!member) return apiErrors.notFound("Space");

  const events = await db().spaceEvent.findMany({
    where: { spaceId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, actorName: true, target: true, targetId: true, createdAt: true },
  });

  return ok({
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      target: e.target,
      targetId: e.targetId,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
