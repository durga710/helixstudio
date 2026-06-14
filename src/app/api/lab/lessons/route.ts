/**
 * Authored lessons owned by a teacher, scoped to a classroom.
 *   GET  ?spaceId=  → the teacher's lessons for that class (list).
 *   POST { spaceId, title? } → create a blank draft to edit from scratch.
 * Owner-of-the-space only.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import type { Lesson } from "@/lib/lessons/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({ spaceId: z.string().min(1).max(60), title: z.string().max(120).optional() });

async function ownsSpace(spaceId: string, userId: string): Promise<boolean> {
  const space = await db().space.findUnique({ where: { id: spaceId }, select: { ownerId: true } });
  return Boolean(space && space.ownerId === userId);
}

export async function GET(req: Request) {
  const g = await guard("lab.lessons.list", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return ok({ lessons: [] });

  const spaceId = new URL(req.url).searchParams.get("spaceId");
  if (!spaceId || !(await ownsSpace(spaceId, g.user.id))) return apiErrors.notFound("Classroom");

  const rows = await db().lesson.findMany({
    where: { authorId: g.user.id, spaceId },
    select: { id: true, title: true, status: true, source: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return ok({ lessons: rows });
}

export async function POST(req: Request) {
  const g = await guard("lab.lessons.create", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { spaceId, title } = parsed.data;
  if (!(await ownsSpace(spaceId, g.user.id))) return apiErrors.notFound("Classroom");

  const t = title?.trim() || "Untitled lesson";
  const doc: Lesson = {
    manifest: { id: "lesson", title: t, blurb: "A new lesson.", level: "beginner", estMinutes: 10, icon: "Sparkles", concept: "ai", order: 100 },
    steps: [{ kind: "explain", title: "Start here", body: "Write your lesson here, or generate one with AI." }],
  };

  const row = await db().lesson.create({
    data: {
      authorId: g.user.id,
      spaceId,
      title: t,
      status: "draft",
      source: "teacher",
      manifest: doc.manifest as unknown as object,
      steps: doc.steps as unknown as object,
    },
    select: { id: true },
  });
  return ok({ id: row.id });
}
