/**
 * /api/spaces/[id]/tasks/[taskId]
 *   PATCH  → move/edit a task (any member): status, title, note, assigneeId, order
 *   DELETE → remove a task (its creator, or the space owner)
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; taskId: string }> };

async function memberTask(spaceId: string, taskId: string, userId: string) {
  const member = await db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { space: { select: { ownerId: true } } },
  });
  if (!member) return null;
  const task = await db().spaceTask.findUnique({ where: { id: taskId } });
  if (!task || task.spaceId !== spaceId) return null;
  return { task, ownerId: member.space.ownerId };
}

const PatchSchema = z.object({
  status: z.enum(["todo", "doing", "done"]).optional(),
  title: z.string().min(1).max(140).optional(),
  note: z.string().max(2000).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  order: z.number().int().min(0).max(1_000_000).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const { id, taskId } = await params;
  const g = await guard("tasks.write", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const found = await memberTask(id, taskId, g.user.id);
  if (!found) return apiErrors.notFound("Task");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const data: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
  if (parsed.data.note !== undefined) data.note = parsed.data.note?.trim() || null;
  if (parsed.data.order !== undefined) data.order = parsed.data.order;
  if (parsed.data.assigneeId !== undefined) {
    if (parsed.data.assigneeId) {
      const assignee = await db().spaceMember.findUnique({
        where: { spaceId_userId: { spaceId: id, userId: parsed.data.assigneeId } },
        select: { id: true },
      });
      if (!assignee) return apiErrors.badRequest("The assignee must be a member of this space.");
    }
    data.assigneeId = parsed.data.assigneeId;
  }
  if (Object.keys(data).length === 0) return apiErrors.badRequest("Nothing to update.");

  await db().spaceTask.update({ where: { id: taskId }, data });

  if (parsed.data.status === "done" && found.task.status !== "done") {
    void recordSpaceEvent({
      spaceId: id,
      userId: g.user.id,
      actorName: actorNameOf(g.user),
      action: "task_done",
      target: found.task.title,
      targetId: taskId,
    });
  }
  return ok({ updated: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, taskId } = await params;
  const g = await guard("tasks.write", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const found = await memberTask(id, taskId, g.user.id);
  if (!found) return apiErrors.notFound("Task");
  if (found.task.createdById !== g.user.id && found.ownerId !== g.user.id) {
    return apiErrors.forbidden();
  }

  await db().spaceTask.delete({ where: { id: taskId } });
  return ok({ deleted: true });
}
