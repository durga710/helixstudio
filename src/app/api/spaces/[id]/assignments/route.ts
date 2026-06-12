/**
 * /api/spaces/[id]/assignments
 *   GET  → assignments in this classroom. The owner (instructor) gets
 *          per-status submission counts; a member gets their own submission
 *          summary per assignment.
 *   POST → create an assignment (instructor only, classroom Spaces only,
 *          free plan capped at FREE_ASSIGNMENT_CAP).
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { getWorkspaceForUser } from "@/lib/workspace";
import { canCreateAssignment } from "@/lib/billing";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The space + the requester's membership, or null when not a member. */
async function memberSpace(spaceId: string, userId: string) {
  const member = await db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: {
      space: {
        select: { id: true, kind: true, ownerId: true, plan: true, seats: true, currentPeriodEnd: true },
      },
    },
  });
  return member?.space ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("assignments.read", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await memberSpace(id, g.user.id);
  if (!space) return apiErrors.notFound("Space");

  const isOwner = space.ownerId === g.user.id;
  const baseSelect = {
    id: true,
    title: true,
    dueAt: true,
    starterWorkspaceId: true,
    createdAt: true,
  } as const;
  const shape = (a: { id: string; title: string; dueAt: Date | null; starterWorkspaceId: string | null; createdAt: Date }) => ({
    id: a.id,
    title: a.title,
    dueAt: a.dueAt ? a.dueAt.toISOString() : null,
    hasStarter: Boolean(a.starterWorkspaceId),
    createdAt: a.createdAt.toISOString(),
  });

  if (isOwner) {
    const assignments = await db().assignment.findMany({
      where: { spaceId: id },
      orderBy: { createdAt: "desc" },
      select: { ...baseSelect, submissions: { select: { status: true } } },
    });
    return ok({
      kind: space.kind,
      isOwner,
      assignments: assignments.map((a) => ({
        ...shape(a),
        startedCount: a.submissions.length,
        submittedCount: a.submissions.filter((s) => s.status !== "in_progress").length,
      })),
    });
  }

  const assignments = await db().assignment.findMany({
    where: { spaceId: id },
    orderBy: { createdAt: "desc" },
    select: {
      ...baseSelect,
      submissions: { where: { userId: g.user.id }, select: { status: true, workspaceId: true, grade: true } },
    },
  });
  return ok({
    kind: space.kind,
    isOwner,
    assignments: assignments.map((a) => ({
      ...shape(a),
      mine: a.submissions[0]
        ? {
            status: a.submissions[0].status,
            workspaceId: a.submissions[0].workspaceId,
            grade: a.submissions[0].status === "reviewed" ? a.submissions[0].grade : null,
          }
        : null,
    })),
  });
}

const CreateSchema = z.object({
  title: z.string().min(1).max(120),
  instructions: z.string().min(1).max(20_000),
  dueAt: z.iso.datetime().optional(),
  starterWorkspaceId: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("assignments.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await memberSpace(id, g.user.id);
  if (!space || space.ownerId !== g.user.id) return apiErrors.notFound("Space");
  if (space.kind !== "classroom") {
    return apiErrors.badRequest("Assignments are available in classroom spaces.");
  }

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const assignmentCount = await db().assignment.count({ where: { spaceId: id } });
  const gate = canCreateAssignment(space, assignmentCount);
  if (!gate.allowed) return apiErrors.upgradeRequired(gate.reason!);

  if (parsed.data.starterWorkspaceId) {
    const starter = await getWorkspaceForUser(parsed.data.starterWorkspaceId, g.user.id);
    if (!starter) return apiErrors.badRequest("The starter must be one of your own workspaces.");
  }

  const assignment = await db().assignment.create({
    data: {
      spaceId: id,
      title: parsed.data.title.trim(),
      instructions: parsed.data.instructions,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      starterWorkspaceId: parsed.data.starterWorkspaceId ?? null,
    },
    select: { id: true, title: true },
  });
  void recordSpaceEvent({
    spaceId: id,
    userId: g.user.id,
    actorName: actorNameOf(g.user),
    action: "assignment_created",
    target: assignment.title,
    targetId: assignment.id,
  });
  return ok({ id: assignment.id });
}
