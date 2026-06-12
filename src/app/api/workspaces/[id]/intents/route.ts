/**
 * /api/workspaces/[id]/intents — GET: the workspace's intent timeline,
 * newest first. Powers the editor's Intents tab (provenance + per-intent
 * undo entry points).
 */

import { ok } from "@/lib/api-response";
import { guardWorkspace } from "@/lib/route-helpers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.read", id, { limit: 300, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  const rows = await db().workspaceIntent.findMany({
    where: { workspaceId: g.ws.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      kind: true,
      status: true,
      title: true,
      userRequest: true,
      reasoning: true,
      revertsIntentId: true,
      createdAt: true,
      changes: { select: { path: true } },
    },
  });

  return ok({
    intents: rows
      // Intents whose writes all failed carry no changes — nothing to show.
      .filter((r) => r.changes.length > 0)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        title: r.title,
        userRequest: r.userRequest.slice(0, 600),
        reasoning: r.reasoning?.slice(0, 1200) ?? null,
        revertsIntentId: r.revertsIntentId,
        createdAt: r.createdAt.toISOString(),
        paths: r.changes.map((c) => c.path).sort(),
      })),
    isOwner: g.isOwner,
  });
}
