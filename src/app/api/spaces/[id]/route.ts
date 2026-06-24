/**
 * /api/spaces/[id]
 *   GET    → space details: members + everyone's shared workspaces
 *   PATCH  → { action: "rename"|"regenerate-code", name? } (owner only)
 *   DELETE → delete the space (owner only)
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { billingEnabled, isPlanActive, memberCap } from "@/lib/billing";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Returns the space + the requester's membership, or null if not a member. */
async function memberSpace(spaceId: string, userId: string) {
  const member = await db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: {
      space: {
        select: {
          id: true,
          name: true,
          kind: true,
          ownerId: true,
          joinCode: true,
          plan: true,
          seats: true,
          currentPeriodEnd: true,
        },
      },
    },
  });
  return member?.space ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("space.read", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await memberSpace(id, g.user.id);
  if (!space) return apiErrors.notFound("Space");

  const [members, workspaces] = await Promise.all([
    db().spaceMember.findMany({
      where: { spaceId: id },
      orderBy: { joinedAt: "asc" },
      select: { role: true, user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    db().workspace.findMany({
      where: { spaceId: id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        mode: true,
        provider: true,
        repo: true,
        updatedAt: true,
        userId: true,
        user: { select: { name: true, email: true } },
        _count: { select: { files: true, messages: true } },
      },
      take: 100, // bound the payload; the panel shows the most-recent shares
    }),
  ]);

  const isOwner = space.ownerId === g.user.id;
  return ok({
    id: space.id,
    name: space.name,
    kind: space.kind,
    isOwner,
    joinCode: space.joinCode,
    billing: {
      enabled: billingEnabled(),
      active: isPlanActive(space),
      seats: space.seats,
      memberCount: members.length,
      memberCap: memberCap(space),
      renewsAt: isPlanActive(space) && space.currentPeriodEnd ? space.currentPeriodEnd.toISOString() : null,
    },
    members: members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email ?? "member",
      image: m.user.image,
      role: m.role,
      isYou: m.user.id === g.user.id,
    })),
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      mode: w.mode,
      provider: w.provider,
      repo: w.repo,
      updatedAt: w.updatedAt.toISOString(),
      ownerName: w.user.name ?? w.user.email ?? "teammate",
      isYours: w.userId === g.user.id,
      fileCount: w._count.files,
      messageCount: w._count.messages,
    })),
  });
}

const PatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().min(1).max(60) }),
  z.object({ action: z.literal("regenerate-code") }),
]);

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("space.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await db().space.findUnique({ where: { id }, select: { ownerId: true } });
  if (!space || space.ownerId !== g.user.id) return apiErrors.notFound("Space");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  if (parsed.data.action === "rename") {
    await db().space.update({ where: { id }, data: { name: parsed.data.name.trim() } });
    return ok({ renamed: true });
  }
  const joinCode = randomBytes(9).toString("base64url");
  await db().space.update({ where: { id }, data: { joinCode } });
  return ok({ joinCode });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("space.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await db().space.findUnique({ where: { id }, select: { ownerId: true } });
  if (!space || space.ownerId !== g.user.id) return apiErrors.notFound("Space");

  await db().space.delete({ where: { id } }); // workspaces' spaceId set null (onDelete: SetNull)
  return ok({ deleted: true });
}
