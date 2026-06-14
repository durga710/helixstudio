/**
 * "Use in my class": clone a public library lesson into the teacher's own
 * lessons (a fresh editable draft scoped to one of their classrooms).
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { coerceLessonDoc } from "@/lib/lessons/schema";
import type { LessonManifest, LessonStep } from "@/lib/lessons/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ lessonId: z.string().min(1).max(80), spaceId: z.string().min(1).max(60) });

export async function POST(req: Request) {
  const g = await guard("lab.lesson.clone", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { lessonId, spaceId } = parsed.data;

  const space = await db().space.findUnique({ where: { id: spaceId }, select: { ownerId: true } });
  if (!space || space.ownerId !== g.user.id) return apiErrors.notFound("Classroom");

  const src = await db().lesson.findUnique({
    where: { id: lessonId },
    select: { authorId: true, status: true, visibility: true, title: true, manifest: true, steps: true },
  });
  // Clone the lesson if it's public, or the user's own.
  const allowed = src && (src.authorId === g.user.id || (src.status === "published" && src.visibility === "public"));
  if (!src || !allowed) return apiErrors.notFound("Lesson");

  const doc = coerceLessonDoc(
    { manifest: src.manifest as unknown as LessonManifest, steps: src.steps as unknown as LessonStep[] },
    lessonId,
  );
  if (!doc) return apiErrors.badRequest("That lesson couldn't be copied.");
  doc.manifest.title = `${src.title} (Copy)`.slice(0, 120);

  const row = await db().lesson.create({
    data: {
      authorId: g.user.id,
      spaceId,
      title: doc.manifest.title,
      status: "draft",
      visibility: "space",
      source: "teacher",
      manifest: doc.manifest as unknown as object,
      steps: doc.steps as unknown as object,
    },
    select: { id: true },
  });
  return ok({ id: row.id });
}
