import "server-only";

/**
 * Durable job persistence + the real step executor. The job state machine lives
 * in WorkspaceTask.job (one JSONB blob); runJobSlice loads it, advances it via
 * the pure runner-core, and writes the checkpoint. Each "agentTurn" step is a
 * scoped runAgentTurn — the same execution unit chat uses.
 */

import { db } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent-turn";
import { runSlice, type SliceDeps } from "./runner-core";
import type { JobState, JobStatus, JobStep } from "./types";

/** Strip undefined so the value is valid Prisma JSON input. */
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v));

export async function createJob(workspaceId: string, prompt: string, state: JobState): Promise<string> {
  const row = await db().workspaceTask.create({
    data: { workspaceId, prompt, status: "queued", job: asJson(state) },
    select: { id: true },
  });
  return row.id;
}

export async function getJob(id: string) {
  return db().workspaceTask.findUnique({ where: { id } });
}

export async function cancelJob(id: string): Promise<void> {
  await db().workspaceTask.update({
    where: { id },
    data: { status: "canceled", finishedAt: new Date() },
  });
}

/** Queued/running jobs whose heartbeat is stale — the cron backstop rescues them. */
export async function findStuckJobIds(staleMs: number, limit = 5): Promise<string[]> {
  const rows = await db().workspaceTask.findMany({
    where: { status: { in: ["queued", "running"] } },
    select: { id: true, job: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const now = Date.now();
  return rows
    .filter((r) => {
      if (!r.job) return false;
      const st = r.job as unknown as JobState;
      const hb = st.heartbeatAt ? Date.parse(st.heartbeatAt) : r.createdAt.getTime();
      return now - hb > staleMs;
    })
    .slice(0, limit)
    .map((r) => r.id);
}

/**
 * Run one slice of a job (until `deadline`), checkpointing each step. Returns
 * whether the job is finished. Caller triggers the next slice when not done.
 */
export async function runJobSlice(id: string, deadline: number): Promise<{ done: boolean; status: JobStatus }> {
  const row = await getJob(id);
  if (!row || !row.job) return { done: true, status: (row?.status as JobStatus) ?? "error" };
  const status = row.status as JobStatus;
  if (status === "done" || status === "error" || status === "canceled") return { done: true, status };

  const state = row.job as unknown as JobState;
  const ws = await db().workspace.findUnique({ where: { id: row.workspaceId } });
  if (!ws) {
    await db().workspaceTask.update({
      where: { id },
      data: { status: "error", error: "workspace not found", finishedAt: new Date() },
    });
    return { done: true, status: "error" };
  }

  await db().workspaceTask.update({ where: { id }, data: { status: "running" } });

  const deps: SliceDeps = {
    deadline,
    execute: async (st, i) => {
      const step: JobStep = st.steps[i]!;
      const res = await runAgentTurn({
        ws,
        userId: st.userId,
        message: step.message,
        mode: step.mode ?? "build",
        verify: step.verify ?? false,
        persist: step.persist ?? true,
        intentId: st.intentId ?? undefined,
      });
      if ("error" in res) return { ok: false, error: res.error };
      return {
        ok: true,
        summary: res.summary ?? res.text,
        written: res.changes.written,
        deleted: res.changes.deleted,
      };
    },
    onCheckpoint: async (st) => {
      await db().workspaceTask.update({ where: { id }, data: { job: asJson(st) } });
    },
    isCanceled: async () => {
      const r = await db().workspaceTask.findUnique({ where: { id }, select: { status: true } });
      return r?.status === "canceled";
    },
  };

  const outcome = await runSlice(state, deps);

  const terminal = outcome.status !== "running";
  const last = outcome.state.results[outcome.state.results.length - 1];
  await db().workspaceTask.update({
    where: { id },
    data: {
      job: asJson(outcome.state),
      status: outcome.status,
      ...(terminal
        ? {
            finishedAt: new Date(),
            changes: { written: outcome.state.written, deleted: outcome.state.deleted },
            resultText: outcome.status === "done" ? (last?.summary ?? "Done.") : null,
            error: outcome.status === "error" ? (last?.error ?? "Job failed.") : null,
          }
        : {}),
    },
  });

  return { done: terminal, status: outcome.status };
}
