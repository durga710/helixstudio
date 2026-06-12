/**
 * /api/spaces/join — POST { code } → join the Space with that invite link.
 * Idempotent (re-joining is a no-op). Guests are asked to sign in first.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
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
    select: { id: true, name: true },
  });
  if (!space) return apiErrors.notFound("Invite link");

  await db().spaceMember.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId: g.user.id } },
    create: { spaceId: space.id, userId: g.user.id, role: "member" },
    update: {},
  });
  return ok({ id: space.id, name: space.name });
}
