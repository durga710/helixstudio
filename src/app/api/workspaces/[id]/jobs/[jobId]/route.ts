/**
 * /api/workspaces/[id]/jobs/[jobId]
 *   GET    → live board for a durable job: status + per-step state (plan,
 *            workers with scope, reviewer rounds), derived from cursor + results.
 *   DELETE → cancel the job (the runner stops before the next step).
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { cancelJob } from "@/lib/jobs/store";
import { guardWorkspace } from "@/lib/route-helpers";
import type { JobState, JobStatus } from "@/lib/jobs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id, jobId } = await params;
  const g = await guardWorkspace("jobs.read", id, { limit: 1200, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  const row = await db().workspaceTask.findUnique({ where: { id: jobId } });
  if (!row || row.workspaceId !== g.ws.id) return apiErrors.notFound("Job not found");
  if (!row.job) {
    // A legacy single-turn task without job state.
    return ok({ id: row.id, status: row.status, kind: "task", steps: [], written: [], deleted: [] });
  }

  const state = row.job as unknown as JobState;
  const status = row.status as JobStatus;

  type BoardStep = {
    kind: string;
    label: string;
    scope: string[];
    state: "done" | "error" | "running" | "pending";
    summary?: string;
  };
  const steps: BoardStep[] = [];
  state.steps.forEach((s, i) => {
    const isPast = i < state.cursor;
    const isCurrent = i === state.cursor && status === "running";

    // Expand a parallel worker batch into one row per worker (live per-worker
    // state from groupDone), so the board shows the fan-out.
    if (s.kind === "workers" && s.tasks?.length) {
      const groupDone = new Set(state.groupDone ?? []);
      s.tasks.forEach((t, ti) => {
        steps.push({
          kind: "agentTurn",
          label: t.title,
          scope: t.scope ?? [],
          state: isPast || groupDone.has(ti) ? "done" : isCurrent ? "running" : "pending",
        });
      });
      return;
    }

    let stepState: BoardStep["state"];
    if (isPast) stepState = state.results[i]?.ok === false ? "error" : "done";
    else if (isCurrent) stepState = "running";
    else stepState = "pending";
    steps.push({
      kind: s.kind,
      label: s.label ?? (s.kind === "agentTurn" ? "Worker" : s.kind),
      scope: s.scope ?? [],
      state: stepState,
      summary: state.results[i]?.summary,
    });
  });

  return ok({
    id: row.id,
    status,
    kind: state.kind,
    prompt: row.prompt,
    cursor: state.cursor,
    steps,
    written: state.written,
    deleted: state.deleted,
    error: row.error,
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, jobId } = await params;
  const g = await guardWorkspace("jobs.cancel", id, { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const row = await db().workspaceTask.findUnique({ where: { id: jobId }, select: { workspaceId: true, status: true } });
  if (!row || row.workspaceId !== g.ws.id) return apiErrors.notFound("Job not found");
  if (row.status === "done" || row.status === "error" || row.status === "canceled") {
    return ok({ canceled: false, status: row.status });
  }
  await cancelJob(jobId);
  return ok({ canceled: true, status: "canceled" });
}
