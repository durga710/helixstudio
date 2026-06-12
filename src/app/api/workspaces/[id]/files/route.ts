/**
 * /api/workspaces/[id]/files
 *   GET    → merged file tree (repo base + overlay)
 *   POST   → save files from the editor: { files: [{path, content}] }
 *   DELETE → ?path= delete one file
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, writeWorkspaceFiles, deleteWorkspaceFile } from "@/lib/workspace";
import { validateFiles, MAX_PUSH_FILES } from "@/lib/repo-files";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.read", id, { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const auth = await getGitAuth(g.user.id, g.ws.provider);
  const files = await withGitAuth(auth, () => listWorkspaceFiles(g.ws));
  return ok({ mode: g.ws.mode, repo: g.ws.repo, baseBranch: g.ws.baseBranch, files });
}

const SaveSchema = z.object({
  files: z
    .array(z.object({ path: z.string().min(1).max(200), content: z.string().max(48_000) }))
    .min(1)
    .max(MAX_PUSH_FILES),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.write", id, { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const check = validateFiles(parsed.data.files, MAX_PUSH_FILES);
  if (!check.ok) return apiErrors.badRequest(check.error);

  const result = await writeWorkspaceFiles(g.ws, parsed.data.files);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok({ saved: true, writtenPaths: result.writtenPaths });
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.write", id, { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return apiErrors.badRequest("path is required");

  const result = await deleteWorkspaceFile(g.ws, path);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok({ deleted: true, deletedPaths: result.deletedPaths });
}
