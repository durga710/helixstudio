/**
 * /api/workspaces/[id]/tasks — background agent turns ("run in background").
 *   POST { message } → create a WorkspaceTask and run the SAME agent turn as
 *          chat after the response returns (next/server after(), ≤ this
 *          route's maxDuration). The client polls GET while tasks run.
 *   GET  → the 10 most recent tasks.
 *
 * Serverless caveat: after() keeps the function alive up to maxDuration; if
 * the platform kills it mid-task the row would stay "running" forever — GET
 * sweeps anything running longer than TASK_TIMEOUT_MS to an error state.
 */

import { z } from "zod";
import { after } from "next/server";
import { db } from "@/lib/db";
import { ok, err, apiErrors } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { runAgentTurn } from "@/lib/agent-turn";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 300;

const TASK_TIMEOUT_MS = 6 * 60 * 1000;

const TaskSchema = z.object({
  message: z.string().min(1).max(8000),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("tasks", id, { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  const session = await auth();
  if (session?.user?.isGuest) {
    return err("GUEST_LIMIT", "Background tasks need an account — sign in to queue work.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = TaskSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const message = parsed.data.message.trim();

  const running = await db().workspaceTask.count({
    where: { workspaceId: ws.id, status: { in: ["queued", "running"] } },
  });
  if (running >= 3) {
    return apiErrors.badRequest("This workspace already has 3 tasks in flight — let one finish first.");
  }

  const task = await db().workspaceTask.create({
    data: { workspaceId: ws.id, prompt: message },
  });

  after(async () => {
    try {
      await db().workspaceTask.update({ where: { id: task.id }, data: { status: "running" } });
      const result = await runAgentTurn({ ws, userId: user.id, message });
      if ("error" in result) {
        await db().workspaceTask.update({
          where: { id: task.id },
          data: { status: "error", error: result.error, finishedAt: new Date() },
        });
      } else {
        await db().workspaceTask.update({
          where: { id: task.id },
          data: {
            status: "done",
            resultText: result.text,
            actions: result.actions,
            changes: { written: result.changes.written, deleted: result.changes.deleted },
            finishedAt: new Date(),
          },
        });
      }
    } catch (e) {
      console.error("[helix-task] crashed", e);
      await db()
        .workspaceTask.update({
          where: { id: task.id },
          data: { status: "error", error: "Task crashed — try again.", finishedAt: new Date() },
        })
        .catch(() => {});
    }
  });

  return ok({ id: task.id, status: "queued" });
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("tasks.read", id, { limit: 1200, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  // Sweep zombies (platform killed the function mid-task).
  await db()
    .workspaceTask.updateMany({
      where: {
        workspaceId: g.ws.id,
        status: { in: ["queued", "running"] },
        createdAt: { lt: new Date(Date.now() - TASK_TIMEOUT_MS) },
      },
      data: { status: "error", error: "Timed out.", finishedAt: new Date() },
    })
    .catch(() => {});

  const tasks = await db().workspaceTask.findMany({
    where: { workspaceId: g.ws.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      prompt: true,
      status: true,
      resultText: true,
      actions: true,
      changes: true,
      error: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  return ok({ tasks });
}
