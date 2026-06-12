/**
 * /api/spaces/join — POST { code } → join the Space with that invite link.
 * Idempotent (re-joining is a no-op). Guests are asked to sign in first.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { canJoin } from "@/lib/billing";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JoinSchema = z.object({ code: z.string().min(4).max(100) });

export async function POST(req: Request) {
  const g = await guard("spaces.join", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = JoinSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const space = await db().space.findUnique({
    where: { joinCode: parsed.data.code.trim() },
    select: {
      id: true,
      name: true,
      plan: true,
      seats: true,
      currentPeriodEnd: true,
      _count: { select: { members: true } },
    },
  });
  if (!space) return apiErrors.notFound("Invite link");

  // Existing members always pass (idempotent re-join); only NEW members count
  // against the seat cap.
  const existing = await db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId: g.user.id } },
    select: { id: true },
  });
  if (!existing) {
    const gate = canJoin(space, space._count.members);
    if (!gate.allowed) return apiErrors.upgradeRequired(gate.reason!);
    await db().spaceMember.create({
      data: { spaceId: space.id, userId: g.user.id, role: "member" },
    });
    void recordSpaceEvent({
      spaceId: space.id,
      userId: g.user.id,
      actorName: actorNameOf(g.user),
      action: "joined",
      target: space.name,
    });
  }
  return ok({ id: space.id, name: space.name });
}
