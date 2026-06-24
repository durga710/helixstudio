/**
 * AI Lab progress — per-student, per-lesson.
 *   POST → upsert progress (step reached, completion, quiz answers/score).
 *   GET  → all of the user's progress (for gallery badges), or one lesson with ?lessonId.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";

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
