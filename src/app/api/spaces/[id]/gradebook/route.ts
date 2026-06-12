/**
 * /api/spaces/[id]/gradebook — GET: the whole classroom at a glance for the
 * instructor. Students × assignments with each cell's status/grade, built
 * from three queries (no N+1 over assignments).
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("gradebook.read", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await db().space.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, ownerId: true },
  });
  if (!space || space.ownerId !== g.user.id) return apiErrors.notFound("Space");
  if (space.kind !== "classroom") return apiErrors.badRequest("The gradebook is for classroom spaces.");

  const [assignments, members, submissions] = await Promise.all([
    db().assignment.findMany({
      where: { spaceId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, dueAt: true },
    }),
    db().spaceMember.findMany({
      where: { spaceId: id, NOT: { userId: space.ownerId } },
      orderBy: { joinedAt: "asc" },
      select: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    db().assignmentSubmission.findMany({
      where: { assignment: { spaceId: id } },
      select: { assignmentId: true, userId: true, status: true, grade: true, submittedAt: true },
    }),
  ]);

  const cells: Record<string, { status: string; grade: string | null; submittedAt: string | null }> = {};
  for (const s of submissions) {
    cells[`${s.assignmentId}:${s.userId}`] = {
      status: s.status,
      grade: s.grade,
      submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
    };
  }

  return ok({
    spaceName: space.name,
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt ? a.dueAt.toISOString() : null,
    })),
    students: members.map((m) => ({
      userId: m.user.id,
      name: m.user.name ?? m.user.email ?? "student",
      image: m.user.image,
    })),
    cells,
  });
}
