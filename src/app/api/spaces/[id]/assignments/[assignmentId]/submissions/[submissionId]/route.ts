/**
 * /api/spaces/[id]/assignments/[assignmentId]/submissions/[submissionId]
 *   PATCH → instructor records feedback and/or a grade; markReviewed flips
 *           the submission to "reviewed" (which reveals feedback/grade to the
 *           student and locks submit/unsubmit).
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; assignmentId: string; submissionId: string }> };

const Schema = z.object({
  feedback: z.string().max(20_000).optional(),
  grade: z.string().max(40).optional(),
  markReviewed: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const { id, assignmentId, submissionId } = await params;
  const g = await guard("assignment.grade", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const submission = await db().assignmentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      assignmentId: true,
      status: true,
      assignment: { select: { spaceId: true, title: true, space: { select: { ownerId: true } } } },
    },
  });
  if (
    !submission ||
    submission.assignmentId !== assignmentId ||
    submission.assignment.spaceId !== id ||
    submission.assignment.space.ownerId !== g.user.id
  ) {
    return apiErrors.notFound("Submission");
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const data: Record<string, unknown> = {};
  if (parsed.data.feedback !== undefined) data.feedback = parsed.data.feedback;
  if (parsed.data.grade !== undefined) data.grade = parsed.data.grade.trim() || null;
  if (parsed.data.markReviewed) {
    data.status = "reviewed";
    data.reviewedAt = new Date();
  }
  if (Object.keys(data).length === 0) return apiErrors.badRequest("Nothing to update.");

  await db().assignmentSubmission.update({ where: { id: submissionId }, data });

  // Feed: announce the review itself, never the grade (that's the student's).
  if (parsed.data.markReviewed && submission.status !== "reviewed") {
    void recordSpaceEvent({
      spaceId: id,
      userId: g.user.id,
      actorName: actorNameOf(g.user),
      action: "reviewed",
      target: submission.assignment.title,
      targetId: assignmentId,
    });
  }
  return ok({ updated: true });
}
