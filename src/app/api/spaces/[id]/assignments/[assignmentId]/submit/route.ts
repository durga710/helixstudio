/**
 * /api/spaces/[id]/assignments/[assignmentId]/submit — POST: the student
 * turns their work in ({action:"submit"}) or takes it back to keep working
 * ({action:"unsubmit"}). Once the instructor marks it reviewed, the
 * submission is locked.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; assignmentId: string }> };

const Schema = z.object({ action: z.enum(["submit", "unsubmit"]) });

export async function POST(req: Request, { params }: Params) {
  const { id, assignmentId } = await params;
  const g = await guard("assignment.submit", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const submission = await db().assignmentSubmission.findUnique({
    where: { assignmentId_userId: { assignmentId, userId: g.user.id } },
    select: { id: true, status: true, assignment: { select: { spaceId: true, title: true } } },
  });
  if (!submission || submission.assignment.spaceId !== id) return apiErrors.notFound("Submission");
  if (submission.status === "reviewed") {
    return apiErrors.conflict("This submission has been graded and can no longer change.");
  }

  if (parsed.data.action === "submit") {
    await db().assignmentSubmission.update({
      where: { id: submission.id },
      data: { status: "submitted", submittedAt: new Date() },
    });
    void recordSpaceEvent({
      spaceId: id,
      userId: g.user.id,
      actorName: actorNameOf(g.user),
      action: "submitted",
      target: submission.assignment.title,
      targetId: assignmentId,
    });
    return ok({ status: "submitted" });
  }

  await db().assignmentSubmission.update({
    where: { id: submission.id },
    data: { status: "in_progress", submittedAt: null },
  });
  return ok({ status: "in_progress" });
}
