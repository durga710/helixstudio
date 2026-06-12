/**
 * /api/spaces
 *   GET  → spaces the user owns or belongs to (with member counts)
 *   POST → { name } create a Space (creator becomes owner) → { id, joinCode }
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(["team", "classroom"]).default("team"),
});

export async function GET() {
  const g = await guard("spaces.read", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const memberships = await db().spaceMember.findMany({
    where: { userId: g.user.id },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      space: {
        select: { id: true, name: true, kind: true, ownerId: true, joinCode: true, _count: { select: { members: true, workspaces: true } } },
      },
    },
  });

  return ok({
    spaces: memberships.map((m) => ({
      id: m.space.id,
      name: m.space.name,
      kind: m.space.kind,
      isOwner: m.space.ownerId === g.user.id,
      joinCode: m.space.joinCode,
      memberCount: m.space._count.members,
      sharedCount: m.space._count.workspaces,
    })),
  });
}

export async function POST(req: Request) {
  const g = await guard("spaces.write", { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const space = await db().space.create({
    data: {
      name: parsed.data.name.trim(),
      kind: parsed.data.kind,
      ownerId: g.user.id,
      joinCode: randomBytes(9).toString("base64url"),
      members: { create: { userId: g.user.id, role: "owner" } },
    },
    select: { id: true, joinCode: true },
  });
  return ok(space);
}
