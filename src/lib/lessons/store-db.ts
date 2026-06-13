import "server-only";

/**
 * DB-aware, viewer-scoped lesson reads — merges the BUNDLED lessons (curriculum)
 * with AUTHORED lessons (teacher/AI-made, in the `Lesson` table). Kept separate
 * from the client-safe `store.ts` so DB access never leaks into client bundles.
 *
 * Visibility: a viewer sees bundled lessons (always) + their own authored
 * lessons + published lessons in classroom Spaces they belong to.
 */

import { db, dbEnabled, schemaReady } from "@/lib/db";
import { getLesson, getLessonManifests } from "./store";
import type { Lesson, LessonManifest, LessonStep } from "./types";

function rowToManifest(row: { id: string; manifest: unknown; source: string; authorName?: string | null }): LessonManifest {
  const m = row.manifest as LessonManifest;
  return { ...m, id: row.id, authored: true, author: row.authorName ?? undefined };
}

function rowToLesson(row: { id: string; manifest: unknown; steps: unknown }): Lesson {
  return { manifest: { ...(row.manifest as LessonManifest), id: row.id, authored: true }, steps: row.steps as LessonStep[] };
}

/** Manifests the viewer can see, bundled first then authored (each by order). */
export async function getLessonsForViewer(userId: string): Promise<LessonManifest[]> {
  const bundled = getLessonManifests();
  if (!dbEnabled()) return bundled;
  try {
    await schemaReady();
    const memberships = await db().spaceMember.findMany({ where: { userId }, select: { spaceId: true } });
    const spaceIds = memberships.map((m) => m.spaceId);
    const rows = await db().lesson.findMany({
      where: {
        OR: [
          { authorId: userId },
          ...(spaceIds.length ? [{ status: "published", spaceId: { in: spaceIds } }] : []),
        ],
      },
      select: { id: true, manifest: true, source: true },
      orderBy: { updatedAt: "desc" },
    });
    const authored = rows.map(rowToManifest).sort((a, b) => a.order - b.order);
    return [...bundled, ...authored];
  } catch {
    return bundled;
  }
}

/** A single lesson the viewer is allowed to open (bundled or authored). */
export async function getLessonForViewer(id: string, userId: string): Promise<Lesson | undefined> {
  const bundled = getLesson(id);
  if (bundled) return bundled;
  if (!dbEnabled()) return undefined;
  try {
    await schemaReady();
    const row = await db().lesson.findUnique({
      where: { id },
      select: { id: true, authorId: true, spaceId: true, status: true, manifest: true, steps: true },
    });
    if (!row) return undefined;
    if (row.authorId === userId) return rowToLesson(row);
    if (row.status === "published" && row.spaceId) {
      const member = await db()
        .spaceMember.findUnique({ where: { spaceId_userId: { spaceId: row.spaceId, userId } }, select: { id: true } })
        .catch(() => null);
      if (member) return rowToLesson(row);
    }
    return undefined;
  } catch {
    return undefined;
  }
}
