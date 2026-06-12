/**
 * /api/spaces/[id]/tasks
 *   GET  → the Space's task board (members only)
 *   POST → { title, note?, assigneeId? } add a task (any member)
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function membership(spaceId: string, userId: string) {
  return db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { space: { select: { ownerId: true } } },
  });
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("tasks.read", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!(await membership(id, g.user.id))) return apiErrors.notFound("Space");

  const tasks = await db().spaceTask.findMany({
    where: { spaceId: id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      note: true,
      status: true,
      assigneeId: true,
      assignee: { select: { name: true, email: true, image: true } },
      createdById: true,
      createdAt: true,
    },
  });

  return ok({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      note: t.note,
      status: t.status,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee ? (t.assignee.name ?? t.assignee.email ?? "member") : null,
      assigneeImage: t.assignee?.image ?? null,
      createdById: t.createdById,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

const CreateSchema = z.object({
  title: z.string().min(1).max(140),
  note: z.string().max(2000).optional(),
  assigneeId: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("tasks.write", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!(await membership(id, g.user.id))) return apiErrors.notFound("Space");

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  if (parsed.data.assigneeId) {
    const assignee = await db().spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: id, userId: parsed.data.assigneeId } },
      select: { id: true },
    });
    if (!assignee) return apiErrors.badRequest("The assignee must be a member of this space.");
  }

  // New tasks land at the bottom of their column.
  const last = await db().spaceTask.findFirst({
    where: { spaceId: id, status: "todo" },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const task = await db().spaceTask.create({
    data: {
      spaceId: id,
      title: parsed.data.title.trim(),
      note: parsed.data.note?.trim() || null,
      assigneeId: parsed.data.assigneeId ?? null,
      createdById: g.user.id,
      order: (last?.order ?? 0) + 1,
    },
    select: { id: true, title: true },
  });

  void recordSpaceEvent({
    spaceId: id,
    userId: g.user.id,
    actorName: actorNameOf(g.user),
    action: "task_added",
    target: task.title,
    targetId: task.id,
  });
  return ok({ id: task.id });
}
