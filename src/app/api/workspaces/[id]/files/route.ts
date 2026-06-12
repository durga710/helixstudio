/**
 * /api/workspaces/[id]/files
 *   GET    → merged file tree (repo base + overlay)
 *   POST   → save files from the editor: { files: [{path, content}] }
 *   DELETE → ?path= delete one file
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFiles, deleteWorkspaceFile } from "@/lib/workspace";
import { validateFiles, MAX_PUSH_FILES } from "@/lib/repo-files";
import { guardWorkspace } from "@/lib/route-helpers";
import { createManualIntent } from "@/lib/intent-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.read", id, { limit: 600, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  // Read as the OWNER's git identity so Space viewers can see imported-repo
  // files without needing their own access to the owner's repo.
  const auth = await getGitAuth(g.ws.userId, g.ws.provider);
  const files = await withGitAuth(auth, () => listWorkspaceFiles(g.ws));
  return ok({ mode: g.ws.mode, repo: g.ws.repo, baseBranch: g.ws.baseBranch, files, isOwner: g.isOwner });
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

  // Intent ledger: drop no-op saves so re-saving an unchanged file doesn't
  // mint junk intents, then record the rest as one manual-edit intent.
  // withGitAuth lets capture read the repo base for IMPORT-mode files.
  const auth = await getGitAuth(g.ws.userId, g.ws.provider);
  const changed = await withGitAuth(auth, async () => {
    const out: { path: string; content: string }[] = [];
    for (const f of parsed.data.files) {
      const current = await readWorkspaceFile(g.ws, f.path).catch(() => null);
      if (current !== f.content) out.push(f);
    }
    return out;
  });
  if (changed.length === 0) return ok({ saved: true, writtenPaths: [] });

  const intentId = await createManualIntent(
    g.ws,
    changed.length === 1 ? `Manual edit: ${changed[0].path}` : `Manual edit: ${changed.length} files`,
  );
  const result = await withGitAuth(auth, () =>
    writeWorkspaceFiles(g.ws, changed, intentId ? { intentId } : undefined),
  );
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok({ saved: true, writtenPaths: result.writtenPaths });
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.write", id, { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return apiErrors.badRequest("path is required");

  const auth = await getGitAuth(g.ws.userId, g.ws.provider);
  const intentId = await createManualIntent(g.ws, `Deleted ${path} in the editor`);
  const result = await withGitAuth(auth, () =>
    deleteWorkspaceFile(g.ws, path, intentId ? { intentId } : undefined),
  );
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok({ deleted: true, deletedPaths: result.deletedPaths });
}
