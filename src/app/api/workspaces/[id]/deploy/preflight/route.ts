/**
 * /api/workspaces/[id]/deploy/preflight
 *   POST → run the deploy preflight gate (security scan + tests + bundle
 *          weight) over the workspace's files. Returns a PreflightReport the
 *          deploy dialog shows before linking. 0-token, fast.
 */

import { ok } from "@/lib/api-response";
import { guardWorkspace } from "@/lib/route-helpers";
import { runPreflight } from "@/lib/deploy/preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("deploy.read", id, { limit: 60, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  const report = await runPreflight({ ws: g.ws, userId: g.user.id });
  return ok(report);
}
