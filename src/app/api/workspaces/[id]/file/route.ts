/**
 * /api/workspaces/[id]/file?path= — GET one file's content (overlay first,
 * repo fallback in IMPORT mode).
 */

import { ok, apiErrors } from "@/lib/api-response";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { readWorkspaceFile } from "@/lib/workspace";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.read", id, { limit: 1200, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return apiErrors.badRequest("path is required");

  const auth = await getGitAuth(g.user.id, g.ws.provider);
  const content = await withGitAuth(auth, () => readWorkspaceFile(g.ws, path));
  if (content === null) return apiErrors.notFound("File");
  return ok({ path, content });
}
