/**
 * /api/workspaces/[id]/run — the app runner (framework live preview).
 *   POST   → export the workspace and start its dev server
 *   GET    → status + preview URL + logs (with live reachability check)
 *   DELETE → stop the run
 *
 * In local dev the app runs on this machine (localhost preview); on
 * serverless deploys it runs in a cloud microVM with a public preview URL.
 * Cloud runs cost money, so they require a real (non-guest) account.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { auth, getGitHubToken } from "@/lib/auth";
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
    const session = await auth();
    if (session?.user?.isGuest) {
      return apiErrors.badRequest(
        "Cloud runs need an account — sign in with GitHub, Google, or email to run apps.",
      );
    }
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

  return ok(await getRunInfo(g.ws));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("run", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  await stopRun(g.ws.id);
  return ok({ stopped: true });
}
