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
import { db } from "@/lib/db";
import { ok, err, apiErrors } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs/driver";
import { guardWorkspace } from "@/lib/route-helpers";

function reqOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

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

  // A background task is now a one-step durable job — same agent turn, but it
  // runs on the resumable job rails (checkpoint + cron/QStash backstop) instead
  // of a fire-and-forget after(), so it survives instance churn. Multi-step jobs
  // (planner→workers→reviewer) will reuse the exact same machinery.
  const taskId = await enqueueJob({
    workspaceId: ws.id,
    userId: user.id,
    prompt: message,
    kind: "task",
    steps: [{ kind: "agentTurn", message, mode: "build", verify: false, persist: true }],
    devOrigin: reqOrigin(req),
  });

  return ok({ id: taskId, status: "queued" });
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("tasks.read", id, { limit: 1200, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  // Sweep zombies (platform killed the function mid-task). Heartbeat-aware: a
  // durable job that's still checkpointing recently is NOT a zombie even if it's
  // been running a while (multi-step refactors legitimately run minutes).
  try {
    const old = await db().workspaceTask.findMany({
      where: {
        workspaceId: g.ws.id,
        status: { in: ["queued", "running"] },
        createdAt: { lt: new Date(Date.now() - TASK_TIMEOUT_MS) },
      },
      select: { id: true, job: true },
    });
    const dead = old
      .filter((r) => {
        const hb = (r.job as { heartbeatAt?: string } | null)?.heartbeatAt;
        return !hb || Date.now() - Date.parse(hb) > TASK_TIMEOUT_MS;
      })
      .map((r) => r.id);
    if (dead.length) {
      await db().workspaceTask.updateMany({
        where: { id: { in: dead } },
        data: { status: "error", error: "Timed out.", finishedAt: new Date() },
      });
    }
  } catch {
    /* sweep is best-effort */
  }

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
