/**
 * /api/workspaces/[id]/run — the local app runner (framework live preview).
 *   POST   → export the workspace and start its dev server
 *   GET    → status + port + logs (with live reachability check)
 *   DELETE → stop the run
 *
 * Only available when GCODE runs on the user's own machine (dev/self-host);
 * serverless deploys get a clear error instead.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { getGitHubToken } from "@/lib/auth";
import { withGitHubToken } from "@/lib/github";
import { startRun, stopRun, getRunInfo, runnerEnabled } from "@/lib/app-runner";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("run", id, { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  if (!runnerEnabled()) {
    return apiErrors.badRequest(
      "Running apps is only available when Helix runs on your own machine (local dev / self-hosted).",
    );
  }

  const token = await getGitHubToken(g.user.id);
  const result = await withGitHubToken(token, () => startRun(g.ws));
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("run.read", id, { limit: 1200, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  return ok(await getRunInfo(g.ws.id));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("run", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  await stopRun(g.ws.id);
  return ok({ stopped: true });
}
