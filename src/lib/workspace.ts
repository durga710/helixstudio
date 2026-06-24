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
 * IMPORT-mode functions hit the workspace's git host, so callers must run
 * inside withGitAuth() (see src/lib/git).
 */

import type { Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getProvider, getGitAuth, withGitAuth } from "@/lib/git";
import {
  isSafeRepoPath,
  MAX_FILE_CHARS,
  MAX_WORKSPACE_FILES,
} from "@/lib/repo-files";
import { cachedJson } from "@/lib/server-cache";

export interface WorkspaceFileEntry {
  path: string;
  size: number;
  source: "workspace" | "repo";
}

/**
 * Short-TTL cache for IMPORT-mode repo trees. The base branch is pinned, so
 * the tree only changes when the remote moves — without this, EVERY file
 * list (tree load, chat context, search) pays a full GitHub recursive-tree
 * round-trip. Two-level (memory + shared Redis) so fresh serverless
 * instances start warm too; trees are paths+sizes only, no contents.
 */
const REPO_TREE_TTL_MS = 60_000;

async function fetchRepoTreeCached(
  ws: Workspace,
): Promise<{ path: string; size: number }[]> {
  return cachedJson(
    `repotree:${ws.provider}:${ws.repo}@${ws.baseBranch ?? ""}`,
    REPO_TREE_TTL_MS,
    async () => {
      const tree = await getProvider(ws.provider).fetchRepoTree(ws.repo!, ws.baseBranch ?? undefined);
      return (tree?.files ?? []).map((f) => ({ path: f.path, size: f.size }));
    },
    // A null/empty tree usually means the fetch failed — don't let a blip
    // present an empty repo for a whole TTL.
    { cacheIf: (files) => files.length > 0 },
  );
}

/** Ownership check — write routes and AI tools go through this. */
export async function getWorkspaceForUser(
  workspaceId: string,
  userId: string,
): Promise<Workspace | null> {
  const ws = await db().workspace.findUnique({ where: { id: workspaceId } });
  if (!ws || ws.userId !== userId) return null;
  return ws;
}

/**
 * Read access: the owner, OR a member of the Space the workspace is shared
 * into, OR (for Community posts) any signed-in user. Used by the read-only
 * routes (view files, diff, run status) so Space teammates can look at — but
 * not modify — each other's work.
 */
export async function getWorkspaceForViewer(
  workspaceId: string,
  userId: string,
): Promise<{ ws: Workspace; isOwner: boolean } | null> {
  const ws = await db().workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return null;
  if (ws.userId === userId) return { ws, isOwner: true };
  if (ws.spaceId) {
    const member = await db().spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: ws.spaceId, userId } },
      select: { id: true },
    });
    if (member) return { ws, isOwner: false };
  }
  // A workspace published to the Community is readable by any signed-in user
  // (so the public detail/preview + fork work). Read-only; hiding/unpublishing
  // the post revokes it immediately.
  const post = await db().communityPost.findFirst({
    where: { workspaceId, kind: "app", hidden: false },
    select: { id: true },
  });
  if (post) return { ws, isOwner: false };
  return null;
}

/**
 * Copy a workspace's effective files into a NEW scratch workspace owned by
 * `newOwnerId`. The copy is independent: no link to the source's repo, Space,
 * or git connection (files are read with the SOURCE owner's git auth so
 * imported repos work). Used by workspace fork and assignment start.
 */
export async function copyWorkspaceAsScratch(
  src: Workspace,
  newOwnerId: string,
  name: string,
): Promise<{ id: string; fileCount: number }> {
  const ownerAuth = await getGitAuth(src.userId, src.provider);
  const tree = await withGitAuth(ownerAuth, () => listWorkspaceFiles(src)).catch(() => []);
  const files: { path: string; content: string }[] = [];
  for (const f of tree.slice(0, MAX_WORKSPACE_FILES)) {
    const content = await withGitAuth(ownerAuth, () => readWorkspaceFile(src, f.path)).catch(() => null);
    if (content !== null) files.push({ path: f.path, content });
  }

  const copy = await db().workspace.create({
    data: {
      userId: newOwnerId,
      name: name.slice(0, 80),
      mode: "SCRATCH",
      files: { create: files.map((f) => ({ path: f.path, content: f.content })) },
    },
    select: { id: true },
  });
  return { id: copy.id, fileCount: files.length };
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
    const repoFiles = await fetchRepoTreeCached(ws);
    for (const f of repoFiles) {
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
    const file = await getProvider(ws.provider).fetchRepoFileContent(ws.repo, path, ws.baseBranch ?? undefined);
    return file?.content ?? null;
  }
  return null;
}

/**
 * Intent-ledger capture: before/after snapshots recorded around a write so
 * line blame and intentional undo can replay history. EOLs are normalized to
 * \n (patch math depends on it). Capture must never fail the write — every
 * caller wraps it in a catch.
 */
const eol = (s: string) => (s.includes("\r") ? s.replace(/\r\n/g, "\n") : s);

type CaptureBefore = { content: string | null; baseUnknown: boolean };

async function readCaptureBefores(
  ws: Workspace,
  paths: string[],
): Promise<Map<string, CaptureBefore>> {
  const befores = new Map<string, CaptureBefore>();
  const rows = await db().workspaceFile.findMany({
    where: { workspaceId: ws.id, path: { in: paths } },
    select: { path: true, content: true, deleted: true },
  });
  for (const r of rows) {
    befores.set(r.path, { content: r.deleted ? null : eol(r.content), baseUnknown: false });
  }
  for (const path of paths) {
    if (befores.has(path)) continue;
    if (ws.mode === "IMPORT" && ws.repo) {
      try {
        const file = await getProvider(ws.provider).fetchRepoFileContent(ws.repo, path, ws.baseBranch ?? undefined);
        befores.set(path, { content: file ? eol(file.content) : null, baseUnknown: false });
      } catch {
        befores.set(path, { content: null, baseUnknown: true });
      }
    } else {
      befores.set(path, { content: null, baseUnknown: false });
    }
  }
  return befores;
}

async function recordChanges(
  ws: Workspace,
  intentId: string,
  entries: { path: string; after: string | null }[],
  befores: Map<string, CaptureBefore> | null,
) {
  for (const e of entries) {
    // A failed before-read means the original content is unknowable.
    const before = befores?.get(e.path) ?? { content: null, baseUnknown: true };
    const after = e.after === null ? null : eol(e.after);
    await db().workspaceChange.upsert({
      where: { intentId_path: { intentId, path: e.path } },
      create: {
        intentId,
        workspaceId: ws.id,
        path: e.path,
        beforeContent: before.content,
        afterContent: after,
        baseUnknown: before.baseUnknown,
      },
      // Repeated writes within one intent coalesce: the first before wins.
      update: { afterContent: after },
    });
  }
}

/**
 * Upserts files into the overlay. Validates paths and sizes; enforces the
 * per-workspace row cap. Returns the written paths or an error. When
 * `capture` is set, before/after snapshots are recorded against that intent.
 */
export async function writeWorkspaceFiles(
  ws: Workspace,
  files: { path: string; content: string }[],
  capture?: { intentId: string },
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

  const befores = capture
    ? await readCaptureBefores(ws, files.map((f) => f.path)).catch(() => null)
    : null;

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

  if (capture) {
    await recordChanges(
      ws,
      capture.intentId,
      files.map((f) => ({ path: f.path, after: f.content })),
      befores,
    ).catch((err) => console.error("[ledger] change capture failed", err));
  }

  return { writtenPaths: files.map((f) => f.path) };
}

/**
 * Deletes a file: SCRATCH mode removes the row; IMPORT mode tombstones the
 * path so the push removes it from the repo.
 */
export async function deleteWorkspaceFile(
  ws: Workspace,
  path: string,
  capture?: { intentId: string },
): Promise<{ deletedPaths: string[] } | { error: string }> {
  if (!isSafeRepoPath(path)) return { error: `unsafe file path: ${path}` };

  const befores = capture
    ? await readCaptureBefores(ws, [path]).catch(() => null)
    : null;

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

  if (capture) {
    await recordChanges(ws, capture.intentId, [{ path, after: null }], befores).catch(
      (err) => console.error("[ledger] change capture failed", err),
    );
  }

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
