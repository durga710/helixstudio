import "server-only";

/**
 * Virtual workspace — the heart of the editor.
 *
 * Overlay model: WorkspaceFile rows exist only for files the AI or user
 * created, modified, or deleted (tombstone). In SCRATCH mode the overlay IS
 * the whole project. In IMPORT mode the base is the GitHub repo at the
 * pinned branch; the effective tree is the repo tree merged with the
 * overlay, and reads check the overlay first.
 *
 * IMPORT-mode functions hit the GitHub API, so callers must run inside
 * withGitHubToken().
 */

import type { Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fetchRepoTree, fetchRepoFileContent } from "@/lib/github";
import {
  isSafeRepoPath,
  MAX_FILE_CHARS,
  MAX_WORKSPACE_FILES,
} from "@/lib/repo-files";

export interface WorkspaceFileEntry {
  path: string;
  size: number;
  source: "workspace" | "repo";
}

/** Ownership check — every route and AI tool goes through this. */
export async function getWorkspaceForUser(
  workspaceId: string,
  userId: string,
): Promise<Workspace | null> {
  const ws = await db().workspace.findUnique({ where: { id: workspaceId } });
  if (!ws || ws.userId !== userId) return null;
  return ws;
}

/**
 * The merged file tree: overlay wins over the repo base; tombstoned paths
 * are removed. SCRATCH mode is just the overlay.
 */
export async function listWorkspaceFiles(ws: Workspace): Promise<WorkspaceFileEntry[]> {
  const overlay = await db().workspaceFile.findMany({
    where: { workspaceId: ws.id },
    select: { path: true, content: true, deleted: true },
  });

  const entries = new Map<string, WorkspaceFileEntry>();

  if (ws.mode === "IMPORT" && ws.repo) {
    const tree = await fetchRepoTree(ws.repo, ws.baseBranch ?? undefined);
    for (const f of tree?.files ?? []) {
      entries.set(f.path, { path: f.path, size: f.size, source: "repo" });
    }
  }

  for (const f of overlay) {
    if (f.deleted) entries.delete(f.path);
    else entries.set(f.path, { path: f.path, size: f.content.length, source: "workspace" });
  }

  return Array.from(entries.values()).sort((a, b) => a.path.localeCompare(b.path));
}

/** Overlay first; IMPORT mode falls through to the repo. Null = not found. */
export async function readWorkspaceFile(ws: Workspace, path: string): Promise<string | null> {
  const row = await db().workspaceFile.findUnique({
    where: { workspaceId_path: { workspaceId: ws.id, path } },
    select: { content: true, deleted: true },
  });
  if (row) return row.deleted ? null : row.content;

  if (ws.mode === "IMPORT" && ws.repo) {
    const file = await fetchRepoFileContent(ws.repo, path, ws.baseBranch ?? undefined);
    return file?.content ?? null;
  }
  return null;
}

/**
 * Upserts files into the overlay. Validates paths and sizes; enforces the
 * per-workspace row cap. Returns the written paths or an error.
 */
export async function writeWorkspaceFiles(
  ws: Workspace,
  files: { path: string; content: string }[],
): Promise<{ writtenPaths: string[] } | { error: string }> {
  for (const f of files) {
    if (!isSafeRepoPath(f.path)) return { error: `unsafe file path: ${f.path || "(empty)"}` };
    if (typeof f.content !== "string") return { error: `missing content for ${f.path}` };
    if (f.content.length > MAX_FILE_CHARS) {
      return { error: `${f.path} is too large — max ${MAX_FILE_CHARS} characters per file` };
    }
  }

  const count = await db().workspaceFile.count({ where: { workspaceId: ws.id } });
  if (count + files.length > MAX_WORKSPACE_FILES) {
    return { error: `workspace is full — max ${MAX_WORKSPACE_FILES} files` };
  }

  await db().$transaction(
    files.map((f) =>
      db().workspaceFile.upsert({
        where: { workspaceId_path: { workspaceId: ws.id, path: f.path } },
        create: { workspaceId: ws.id, path: f.path, content: f.content },
        update: { content: f.content, deleted: false },
      }),
    ),
  );
  await db().workspace.update({ where: { id: ws.id }, data: { updatedAt: new Date() } });

  return { writtenPaths: files.map((f) => f.path) };
}

/**
 * Deletes a file: SCRATCH mode removes the row; IMPORT mode tombstones the
 * path so the push removes it from the repo.
 */
export async function deleteWorkspaceFile(
  ws: Workspace,
  path: string,
): Promise<{ deletedPaths: string[] } | { error: string }> {
  if (!isSafeRepoPath(path)) return { error: `unsafe file path: ${path}` };

  if (ws.mode === "SCRATCH") {
    await db().workspaceFile.deleteMany({ where: { workspaceId: ws.id, path } });
  } else {
    await db().workspaceFile.upsert({
      where: { workspaceId_path: { workspaceId: ws.id, path } },
      create: { workspaceId: ws.id, path, content: "", deleted: true },
      update: { content: "", deleted: true },
    });
  }
  await db().workspace.update({ where: { id: ws.id }, data: { updatedAt: new Date() } });

  return { deletedPaths: [path] };
}

/** The overlay as a push payload: changed files + tombstoned deletions. */
export async function getOverlay(
  ws: Workspace,
): Promise<{ files: { path: string; content: string }[]; deletions: string[] }> {
  const rows = await db().workspaceFile.findMany({
    where: { workspaceId: ws.id },
    select: { path: true, content: true, deleted: true },
    orderBy: { path: "asc" },
  });
  return {
    files: rows.filter((r) => !r.deleted).map((r) => ({ path: r.path, content: r.content })),
    deletions: rows.filter((r) => r.deleted).map((r) => r.path),
  };
}
