/**
 * /api/workspaces/[id]/diff — GET: the pending changes as reviewable pairs.
 * For every overlay row: { path, status, base, current } where base is the
 * repo's version at the pinned branch (IMPORT) or "" (SCRATCH/new file).
 * Feeds the editor's Diff tab and the change reviewer.
 */

import { ok } from "@/lib/api-response";
import { getGitAuth, withGitAuth, getProvider } from "@/lib/git";
import { getOverlay } from "@/lib/workspace";
import { MAX_FILE_CHARS } from "@/lib/repo-files";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface DiffEntry {
  path: string;
  status: "added" | "modified" | "deleted";
  base: string;
  current: string;
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("diff", id, { limit: 300, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;
  const { ws } = g;

  const overlay = await getOverlay(ws);
  const gitAuth = ws.mode === "IMPORT" ? await getGitAuth(ws.userId, ws.provider) : null;

  const readBase = async (path: string): Promise<string> => {
    if (ws.mode !== "IMPORT" || !ws.repo) return "";
    const file = await withGitAuth(gitAuth, () =>
      getProvider(ws.provider).fetchRepoFileContent(ws.repo!, path, ws.baseBranch ?? undefined),
    ).catch(() => null);
    return (file?.content ?? "").slice(0, MAX_FILE_CHARS);
  };

  // Bounded concurrency over the overlay (≤ MAX_WORKSPACE_FILES rows, base
  // reads only matter for IMPORT mode).
  const entries: DiffEntry[] = [];
  const work: { path: string; status: DiffEntry["status"]; current: string }[] = [
    ...overlay.files.map((f) => ({ path: f.path, status: "modified" as const, current: f.content })),
    ...overlay.deletions.map((path) => ({ path, status: "deleted" as const, current: "" })),
  ];
  for (let i = 0; i < work.length; i += 6) {
    const batch = work.slice(i, i + 6);
    const resolved = await Promise.all(
      batch.map(async (w) => {
        const base = await readBase(w.path);
        const status: DiffEntry["status"] =
          w.status === "deleted" ? "deleted" : base === "" ? "added" : "modified";
        return { path: w.path, status, base, current: w.current.slice(0, MAX_FILE_CHARS) };
      }),
    );
    entries.push(...resolved);
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return ok({
    mode: ws.mode,
    repo: ws.repo,
    baseBranch: ws.baseBranch,
    entries,
    counts: {
      added: entries.filter((e) => e.status === "added").length,
      modified: entries.filter((e) => e.status === "modified").length,
      deleted: entries.filter((e) => e.status === "deleted").length,
    },
  });
}
