/**
 * /api/workspaces/[id]/exec — the editor terminal.
 *   POST { command } → run one shell command in the workspace environment and
 *   return { command, exitCode, stdout, stderr }.
 *
 * Same execution model as the app runner: a cloud microVM on serverless
 * deploys, a temp-dir child process on local dev. The workspace copy is
 * disposable, so commands never change stored files. Owner-only; cloud runs
 * cost money, so they require a real (non-guest) account.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { execCommand, runnerEnabled } from "@/lib/app-runner";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_COMMAND_LEN = 500;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("exec", id, { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  if (!runnerEnabled()) {
    const session = await auth();
    if (session?.user?.isGuest) {
      return apiErrors.badRequest(
        "Running commands needs an account — sign in with GitHub, Google, or email.",
      );
    }
  }

  const body = await req.json().catch(() => null);
  const command = typeof body?.command === "string" ? body.command.trim() : "";
  if (!command) return apiErrors.badRequest("command is required");
  if (command.length > MAX_COMMAND_LEN) {
    return apiErrors.badRequest(`command too long — max ${MAX_COMMAND_LEN} characters`);
  }

  const result = await execCommand(g.ws, command);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok({ command, ...result });
}
