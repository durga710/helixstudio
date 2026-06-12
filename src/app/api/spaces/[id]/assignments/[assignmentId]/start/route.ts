/**
 * /api/spaces/[id]/assignments/[assignmentId]/start — POST: a student begins
 * the assignment. Copies the starter workspace's files (or creates an empty
 * scratch workspace) into a workspace the student owns, linked to their
 * submission record. Idempotent: starting twice returns the same workspace.
 *
 * The submission row is created BEFORE the workspace — its unique
 * (assignmentId, userId) constraint is the double-click race guard — and a
 * row left with workspaceId null by an earlier crash gets its fork retried.
 */

import { Prisma } from "@/generated/prisma/client";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { copyWorkspaceAsScratch } from "@/lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; assignmentId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id, assignmentId } = await params;
  const g = await guard("assignment.start", { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const member = await db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: id, userId: g.user.id } },
    select: { space: { select: { ownerId: true } } },
  });
  if (!member) return apiErrors.notFound("Assignment");
  if (member.space.ownerId === g.user.id) {
    return apiErrors.badRequest("Instructors don't submit their own assignments.");
  }

  const assignment = await db().assignment.findUnique({
    where: { id: assignmentId },
    include: { starterWorkspace: true },
  });
  if (!assignment || assignment.spaceId !== id) return apiErrors.notFound("Assignment");

  // Claim (or find) the submission row first.
  let submission;
  try {
    submission = await db().assignmentSubmission.create({
      data: { assignmentId, userId: g.user.id },
      select: { id: true, workspaceId: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      submission = await db().assignmentSubmission.findUnique({
        where: { assignmentId_userId: { assignmentId, userId: g.user.id } },
        select: { id: true, workspaceId: true },
      });
    } else {
      throw e;
    }
  }
  if (!submission) return apiErrors.internal();
  if (submission.workspaceId) return ok({ workspaceId: submission.workspaceId, existing: true });

  // Build the student's copy (retry path lands here too).
  const ws = assignment.starterWorkspace
    ? await copyWorkspaceAsScratch(assignment.starterWorkspace, g.user.id, assignment.title)
    : await db()
        .workspace.create({
          data: { userId: g.user.id, name: assignment.title.slice(0, 80), mode: "SCRATCH" },
          select: { id: true },
        })
        .then((w) => ({ id: w.id, fileCount: 0 }));

  await db().assignmentSubmission.update({
    where: { id: submission.id },
    data: { workspaceId: ws.id },
  });
  return ok({ workspaceId: ws.id, fileCount: ws.fileCount, existing: false });
}
