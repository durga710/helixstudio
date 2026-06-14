/**
 * AI Lab progress — per-student, per-lesson.
 *   POST → upsert progress (step reached, completion, quiz answers/score).
 *   GET  → all of the user's progress (for gallery badges), or one lesson with ?lessonId.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { recordSpaceEvent } from "@/lib/space-events";

/**
 * If this lesson is assigned as homework in any class the student belongs to,
 * mirror their progress onto the AssignmentSubmission. On completion the lesson
 * is auto-graded from its quiz (objective → final; the teacher can override).
 */
async function syncLessonAssignments(
  userId: string,
  userName: string,
  lessonId: string,
  status: string | undefined,
  quizScore: number | undefined,
): Promise<void> {
  try {
    const memberships = await db().spaceMember.findMany({ where: { userId }, select: { spaceId: true } });
    const spaceIds = memberships.map((m) => m.spaceId);
    if (spaceIds.length === 0) return;
    const assignments = await db().assignment.findMany({
      where: { lessonId, spaceId: { in: spaceIds } },
      select: { id: true, title: true, spaceId: true },
    });
    const completed = status === "completed";
    const grade = completed ? `${Math.round((quizScore ?? 0) * 100)}%` : undefined;
    for (const a of assignments) {
      const data = completed
        ? { status: "reviewed", grade, reviewedAt: new Date(), submittedAt: new Date(), aiReview: "Auto-graded from the quiz." }
        : { status: "in_progress" };
      await db()
        .assignmentSubmission.upsert({
          where: { assignmentId_userId: { assignmentId: a.id, userId } },
          create: { assignmentId: a.id, userId, ...data },
          update: data,
        })
        .catch(() => {});
      if (completed) {
        void recordSpaceEvent({
          spaceId: a.spaceId,
          userId,
          actorName: userName,
          action: "lesson_completed",
          target: a.title,
          targetId: a.id,
        });
      }
    }
  } catch {
    /* best-effort — never block progress saving */
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  lessonId: z.string().min(1).max(80),
  currentStep: z.number().int().min(0).max(200).optional(),
  status: z.enum(["in_progress", "completed"]).optional(),
  quizAnswers: z.record(z.string(), z.number()).optional(),
  quizScore: z.number().min(0).max(1).optional(),
});

export async function POST(req: Request) {
  const g = await guard("lab.progress", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return ok({ saved: false });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { lessonId, currentStep, status, quizAnswers, quizScore } = parsed.data;

  const data = {
    ...(currentStep !== undefined && { currentStep }),
    ...(status && { status }),
    ...(quizAnswers && { quizAnswers }),
    ...(quizScore !== undefined && { quizScore }),
    ...(status === "completed" && { completedAt: new Date() }),
  };

  await db()
    .lessonProgress.upsert({
      where: { userId_lessonId: { userId: g.user.id, lessonId } },
      create: { userId: g.user.id, lessonId, ...data },
      update: data,
    })
    .catch(() => {});

  // If this lesson is assigned as homework, mirror progress + auto-grade.
  await syncLessonAssignments(g.user.id, g.user.name ?? g.user.email ?? "A student", lessonId, status, quizScore);

  return ok({ saved: true });
}

export async function GET(req: Request) {
  const g = await guard("lab.progress.read", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return ok({ progress: [] });

  const lessonId = new URL(req.url).searchParams.get("lessonId");
  if (lessonId) {
    const row = await db()
      .lessonProgress.findUnique({ where: { userId_lessonId: { userId: g.user.id, lessonId } } })
      .catch(() => null);
    return ok({ progress: row });
  }
  const rows = await db()
    .lessonProgress.findMany({
      where: { userId: g.user.id },
      select: { lessonId: true, status: true, currentStep: true },
    })
    .catch(() => []);
  return ok({ progress: rows });
}
