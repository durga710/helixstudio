/**
 * /api/spaces/[id]/assignments/[assignmentId]
 *   GET    → assignment detail. Instructor: full roster (every student ×
 *            submission status). Student: instructions + own submission;
 *            feedback/grade appear once the instructor marks it reviewed.
 *   PATCH  → edit title/instructions/dueAt/starter (instructor only)
 *   DELETE → remove the assignment (instructor only; student workspaces
 *            survive — only the submission records go).
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { getWorkspaceForUser } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; assignmentId: string }> };

/** Assignment in a space the user belongs to, or null. */
async function memberAssignment(spaceId: string, assignmentId: string, userId: string) {
  const member = await db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { space: { select: { id: true, name: true, kind: true, ownerId: true } } },
  });
  if (!member) return null;
  const assignment = await db().assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.spaceId !== spaceId) return null;
  return { space: member.space, assignment };
}

export async function GET(_req: Request, { params }: Params) {
  const { id, assignmentId } = await params;
  const g = await guard("assignment.read", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const found = await memberAssignment(id, assignmentId, g.user.id);
  if (!found) return apiErrors.notFound("Assignment");
  const { space, assignment } = found;
  const isOwner = space.ownerId === g.user.id;

  const base = {
    id: assignment.id,
    spaceId: space.id,
    spaceName: space.name,
    title: assignment.title,
    instructions: assignment.instructions,
    dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
    starterWorkspaceId: assignment.starterWorkspaceId,
    isOwner,
  };

  if (!isOwner) {
    const mine = await db().assignmentSubmission.findUnique({
      where: { assignmentId_userId: { assignmentId, userId: g.user.id } },
    });
    return ok({
      ...base,
      mine: mine
        ? {
            id: mine.id,
            status: mine.status,
            workspaceId: mine.workspaceId,
            submittedAt: mine.submittedAt ? mine.submittedAt.toISOString() : null,
            // Grading is visible to the student once the instructor finishes.
            grade: mine.status === "reviewed" ? mine.grade : null,
            feedback: mine.status === "reviewed" ? mine.feedback : null,
          }
        : null,
    });
  }

  const [members, submissions] = await Promise.all([
    db().spaceMember.findMany({
      where: { spaceId: id, NOT: { userId: space.ownerId } },
      orderBy: { joinedAt: "asc" },
      select: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    db().assignmentSubmission.findMany({ where: { assignmentId } }),
  ]);
  const byUser = new Map(submissions.map((s) => [s.userId, s]));

  return ok({
    ...base,
    roster: members.map((m) => {
      const sub = byUser.get(m.user.id);
      return {
        userId: m.user.id,
        name: m.user.name ?? m.user.email ?? "student",
        image: m.user.image,
        submissionId: sub?.id ?? null,
        status: sub ? sub.status : "not_started",
        workspaceId: sub?.workspaceId ?? null,
        submittedAt: sub?.submittedAt ? sub.submittedAt.toISOString() : null,
        grade: sub?.grade ?? null,
        feedback: sub?.feedback ?? null,
        aiReview: sub?.aiReview ?? null,
      };
    }),
  });
}

const PatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  instructions: z.string().min(1).max(20_000).optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  starterWorkspaceId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const { id, assignmentId } = await params;
  const g = await guard("assignment.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const found = await memberAssignment(id, assignmentId, g.user.id);
  if (!found || found.space.ownerId !== g.user.id) return apiErrors.notFound("Assignment");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
  if (parsed.data.instructions !== undefined) data.instructions = parsed.data.instructions;
  if (parsed.data.dueAt !== undefined) data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (parsed.data.starterWorkspaceId !== undefined) {
    if (parsed.data.starterWorkspaceId) {
      const starter = await getWorkspaceForUser(parsed.data.starterWorkspaceId, g.user.id);
      if (!starter) return apiErrors.badRequest("The starter must be one of your own workspaces.");
    }
    data.starterWorkspaceId = parsed.data.starterWorkspaceId;
  }
  if (Object.keys(data).length === 0) return apiErrors.badRequest("Nothing to update.");

  await db().assignment.update({ where: { id: assignmentId }, data });
  return ok({ updated: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, assignmentId } = await params;
  const g = await guard("assignment.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const found = await memberAssignment(id, assignmentId, g.user.id);
  if (!found || found.space.ownerId !== g.user.id) return apiErrors.notFound("Assignment");

  await db().assignment.delete({ where: { id: assignmentId } }); // submissions cascade; workspaces survive
  return ok({ deleted: true });
}
