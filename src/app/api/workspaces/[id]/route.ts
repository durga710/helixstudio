/**
 * /api/workspaces/[id]
 *   GET    → workspace metadata + recent chat messages (for hydration)
 *   PATCH  → rename
 *   DELETE → delete (cascades files + messages)
 */

import { z } from "zod";
import { db } from "@/lib/db";
import { ok, apiErrors } from "@/lib/api-response";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.read", id, { limit: 600, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  const messages = await db().workspaceMessage.findMany({
    where: { workspaceId: g.ws.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, actions: true },
    take: 100,
  });

  // Non-owners (Space viewers) get the same view, read-only.
  let ownerName: string | null = null;
  if (!g.isOwner) {
    const owner = await db().user.findUnique({ where: { id: g.ws.userId }, select: { name: true, email: true } });
    ownerName = owner?.name ?? owner?.email ?? "a teammate";
  }

  return ok({
    workspace: {
      id: g.ws.id,
      name: g.ws.name,
      mode: g.ws.mode,
      provider: g.ws.provider,
      repo: g.ws.repo,
      baseBranch: g.ws.baseBranch,
    },
    messages,
    isOwner: g.isOwner,
    ownerName,
  });
}

const PatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  // Share into a Space (must be one the user belongs to) or null to un-share.
  spaceId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.write", id, { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const data: { name?: string; spaceId?: string | null } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.spaceId !== undefined) {
    if (parsed.data.spaceId === null) {
      data.spaceId = null;
    } else {
      const member = await db().spaceMember.findUnique({
        where: { spaceId_userId: { spaceId: parsed.data.spaceId, userId: g.user.id } },
        select: { id: true },
      });
      if (!member) return apiErrors.badRequest("You're not a member of that Space.");
      data.spaceId = parsed.data.spaceId;
    }
  }
  if (Object.keys(data).length === 0) return apiErrors.badRequest("Nothing to update.");

  await db().workspace.update({ where: { id: g.ws.id }, data });
  return ok({ updated: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.write", id, { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  await db().workspace.delete({ where: { id: g.ws.id } });
  return ok({ deleted: true });
}
