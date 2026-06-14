/**
 * A teacher's authored lesson.
 *   GET    → full lesson (for the editor).
 *   PATCH  → save edited { manifest, steps } (validated/repaired).
 *   DELETE → remove it.
 * Author-only.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { coerceLessonDoc } from "@/lib/lessons/schema";
import type { LessonManifest, LessonStep } from "@/lib/lessons/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const PatchSchema = z.object({ manifest: z.unknown(), steps: z.unknown() });

export async function GET(_req: Request, { params }: Params) {
  const g = await guard("lab.lesson.read", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.notFound("Lesson");
  const { id } = await params;

  const row = await db().lesson.findUnique({
    where: { id },
    select: { id: true, authorId: true, spaceId: true, status: true, manifest: true, steps: true },
  });
  if (!row || row.authorId !== g.user.id) return apiErrors.notFound("Lesson");

  return ok({
    id: row.id,
    spaceId: row.spaceId,
    status: row.status,
    manifest: { ...(row.manifest as unknown as LessonManifest), id: row.id },
    steps: row.steps as unknown as LessonStep[],
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard("lab.lesson.edit", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  const { id } = await params;

  const row = await db().lesson.findUnique({ where: { id }, select: { authorId: true } });
  if (!row || row.authorId !== g.user.id) return apiErrors.notFound("Lesson");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const doc = coerceLessonDoc({ manifest: parsed.data.manifest, steps: parsed.data.steps }, id);
  if (!doc) return apiErrors.badRequest("The lesson needs at least one valid step.");

  await db().lesson.update({
    where: { id },
    data: {
      title: doc.manifest.title,
      manifest: doc.manifest as unknown as object,
      steps: doc.steps as unknown as object,
    },
  });
  return ok({ saved: true, steps: doc.steps.length });
}

export async function DELETE(_req: Request, { params }: Params) {
  const g = await guard("lab.lesson.delete", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  const { id } = await params;

  const row = await db().lesson.findUnique({ where: { id }, select: { authorId: true } });
  if (!row || row.authorId !== g.user.id) return apiErrors.notFound("Lesson");

  await db().lesson.delete({ where: { id } });
  return ok({ deleted: true });
}
