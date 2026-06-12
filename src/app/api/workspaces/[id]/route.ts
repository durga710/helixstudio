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
  const g = await guardWorkspace("ws.read", id, { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const messages = await db().workspaceMessage.findMany({
    where: { workspaceId: g.ws.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, actions: true },
    take: 100,
  });

  return ok({
    workspace: {
      id: g.ws.id,
      name: g.ws.name,
      mode: g.ws.mode,
      repo: g.ws.repo,
      baseBranch: g.ws.baseBranch,
    },
    messages,
  });
}

const PatchSchema = z.object({ name: z.string().min(1).max(80) });

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

  await db().workspace.update({ where: { id: g.ws.id }, data: { name: parsed.data.name.trim() } });
  return ok({ renamed: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.write", id, { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  await db().workspace.delete({ where: { id: g.ws.id } });
  return ok({ deleted: true });
}
