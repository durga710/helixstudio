/**
 * /api/workspaces/[id]/verify — POST: run the current build in the sandbox and
 * report pass/fail + log, WITHOUT changing files (maxAttempts: 0, no model fix).
 * This is the on-demand "does my build work?" check behind the chat's Verify
 * button. Auto-fixing lives in the build turn's verify phase (agent-turn.ts).
 */

import { ok } from "@/lib/api-response";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import { usingSandboxBackend, runnerEnabled } from "@/lib/app-runner";
import { verifyBuild } from "@/lib/verify";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("verify", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { ws } = g;

  if (!usingSandboxBackend() && !runnerEnabled()) {
    return ok({ verify: { status: "skipped", reason: "the runner isn't available here" } });
  }

  const auth = await getGitAuth(ws.userId, ws.provider);
  const tree = await withGitAuth(auth, () => listWorkspaceFiles(ws)).catch(() => []);
  const treePaths = tree.map((f) => f.path);
  const pkgJson = treePaths.includes("package.json")
    ? await withGitAuth(auth, () => readWorkspaceFile(ws, "package.json")).catch(() => null)
    : null;

  const result = await verifyBuild({
    ws,
    treePaths,
    pkgJson,
    changes: { written: [], deleted: [] },
    actions: [],
    emit: () => {},
    maxAttempts: 0, // check only — never fixes
    runFix: async () => null,
    readFile: (p) => withGitAuth(auth, () => readWorkspaceFile(ws, p)).catch(() => null),
    deep: true, // on-demand "Verify build" → also run it in a headless browser
  });

  return ok({ verify: { status: result.status, command: result.command, log: result.log, reason: result.reason } });
}
