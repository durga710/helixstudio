/**
 * /api/workspaces/[id]/fork — POST: copy a workspace (yours, or a teammate's
 * shared one) into a NEW scratch workspace owned by you. This is how you build
 * on someone else's Space project. Read-guarded; the copy takes the files, not
 * the owner's git connection.
 */

import { ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import { MAX_WORKSPACE_FILES } from "@/lib/repo-files";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.fork", id, { limit: 30, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  // Read the source's effective files as the OWNER (covers imported repos).
  const ownerAuth = await getGitAuth(g.ws.userId, g.ws.provider);
  const tree = await withGitAuth(ownerAuth, () => listWorkspaceFiles(g.ws)).catch(() => []);
  const files: { path: string; content: string }[] = [];
  for (const f of tree.slice(0, MAX_WORKSPACE_FILES)) {
    const content = await withGitAuth(ownerAuth, () => readWorkspaceFile(g.ws, f.path)).catch(() => null);
    if (content !== null) files.push({ path: f.path, content });
  }

  // A fork is a fresh SCRATCH workspace owned by the requester — the copy is
  // independent (no link to the source's repo or Space).
  const fork = await db().workspace.create({
    data: {
      userId: g.user.id,
      name: `Copy of ${g.ws.name}`.slice(0, 80),
      mode: "SCRATCH",
      files: { create: files.map((f) => ({ path: f.path, content: f.content })) },
    },
    select: { id: true },
  });
  return ok({ id: fork.id, fileCount: files.length });
}
