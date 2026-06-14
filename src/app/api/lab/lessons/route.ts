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
  // Start from the house pattern (frame → predict → interact → reveal → reflect →
  // recall), not a blank page — so teachers edit a real lesson into shape.
  const doc: Lesson = {
    manifest: {
      id: "lesson",
      title: t,
      blurb: "One-line hook that makes a student want to start.",
      level: "beginner",
      estMinutes: 12,
      icon: "Sparkles",
      concept: "ai",
      order: 100,
      objectives: ["What this lesson teaches — bullet one", "Bullet two", "Bullet three"],
      glossary: [{ term: "Key term", def: "A kid-friendly meaning students can tap to read." }],
    },
    steps: [
      { kind: "explain", title: "Part 1 · Hook", body: "Open with a relatable question or story. Keep it short and **bold** the key idea." },
      { kind: "predict", title: "A quick guess", prompt: "Ask a low-stakes prediction before the reveal.", choices: ["Option A", "Option B", "Not sure"], afterPick: "Nice — let's find out together. →", youWillDo: "make a prediction" },
      { kind: "widget", widget: "sortGame", title: "Try it", body: "Drop in an interactive widget where it fits. (Swap this for any widget — keep variety, don't repeat one.)", youWillDo: "do the hands-on part", config: { dataset: "boundary" } },
      { kind: "explain", title: "Name the idea", body: "After they've experimented, name the concept and explain what just happened." },
      { kind: "quiz", title: "Quick check", question: "A recognition check on the idea.", choices: ["Right answer", "A wrong one", "Another wrong one"], answer: 0, explain: "Say why it's right." },
      { kind: "reflect", title: "Say it your way", prompt: "Ask them to explain the idea in their own words.", placeholder: "It works like…", recall: { question: "A retrieval check that resurfaces the idea.", choices: ["Right answer", "A wrong one"], answer: 0, explain: "Reinforce why." }, youWillDo: "explain it back" },
      { kind: "explain", title: "Recap 🎉", body: "Wrap up what they learned and tee up what's next." },
    ],
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
