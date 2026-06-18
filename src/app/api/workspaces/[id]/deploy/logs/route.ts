/**
 * /api/workspaces/[id]/deploy/logs
 *   GET → recent deployments for the linked project (the "Monitor" view).
 *         Best-effort: returns [] when the platform has no logs() or the
 *         token can't be resolved.
 */

import { ok } from "@/lib/api-response";
import { guardWorkspace } from "@/lib/route-helpers";
import { db } from "@/lib/db";
import { getDeployAuth, getDeployProvider } from "@/lib/deploy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("deploy.read", id, { limit: 300, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  const link = await db().workspaceDeploy.findUnique({ where: { workspaceId: g.ws.id } });
  if (!link) return ok({ events: [] });

  const provider = getDeployProvider(link.provider);
  const auth = g.isOwner ? await getDeployAuth(g.user.id, link.provider) : null;
  if (!provider?.logs || !auth) return ok({ events: [] });

  const result = await provider.logs(auth, { projectId: link.projectId });
  if ("error" in result) return ok({ events: [], note: result.error });
  return ok({ events: result });
}
