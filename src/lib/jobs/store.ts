import "server-only";

/**
 * Durable job persistence + the real step executor. The job state machine lives
 * in WorkspaceTask.job (one JSONB blob); runJobSlice loads it, advances it via
 * the pure runner-core, and writes the checkpoint. Each "agentTurn" step is a
 * scoped runAgentTurn — the same execution unit chat uses.
 */

import { db } from "@/lib/db";
import type { Workspace } from "@/generated/prisma/client";
import { runAgentTurn } from "@/lib/agent-turn";
import { runSlice, type SliceDeps } from "./runner-core";
import { planRefactor, type PlannedTask } from "./planner";
import { reviewJob, MAX_REWORK_ROUNDS } from "./reviewer";
import { nextLaunchable } from "./schedule";
import { WORKER_CONCURRENCY, JOB_TOKEN_CAP } from "./config";
import type { JobState, JobStatus, JobStep } from "./types";

const uniq = (a: string[]) => Array.from(new Set(a));

/** The message a worker sees — its scoped sub-task, isolated from the rest. */
function workerBrief(t: PlannedTask): string {
  const scope = t.scope.length ? `\nScope — only edit these files: ${t.scope.join(", ")}` : "";
  const acc = t.acceptance ? `\nDone when: ${t.acceptance}` : "";
  return (
    `You are ONE worker in a larger change. Do ONLY this sub-task; don't touch anything outside it.\n` +
    `Sub-task: ${t.title}${scope}${acc}\n\n${t.instruction}`
  );
}

function workerStep(t: PlannedTask): JobStep {
  return {
    kind: "agentTurn",
    message: workerBrief(t),
    mode: "build",
    verify: false,
    persist: false, // the job posts ONE final summary, not one per worker
    scope: t.scope,
    label: t.title,
  };
}

/**
 * Run a batch of worker sub-tasks with bounded concurrency. The scheduler only
 * runs scope-DISJOINT tasks at the same time (Phase B enforcement guarantees they
 * can't touch the same file), so there's never a write collision — no merge
 * needed; conflicting tasks simply serialize. Checkpoints after each worker so a
 * slice timeout resumes the rest. Returns complete=false when the deadline hits.
 */
async function runWorkerGroup(opts: {
  ws: Workspace;
  userId: string;
  intentId?: string | null;
  tasks: PlannedTask[];
  done: number[];
  deadline: number;
  checkpoint: (done: number[], written: string[], deleted: string[]) => Promise<void>;
}): Promise<{ complete: boolean; done: number[]; written: string[]; deleted: string[]; tokens: number }> {
  const { ws, userId, intentId, tasks, deadline, checkpoint } = opts;
  const done = new Set<number>(opts.done);
  const running = new Set<number>();
  const written = new Set<string>();
  const deleted = new Set<string>();
  let tokens = 0;
  const inflight = new Map<number, Promise<{ idx: number; res: Awaited<ReturnType<typeof runAgentTurn>> }>>();

  const launch = () => {
    if (Date.now() >= deadline) return;
    let ready = nextLaunchable(tasks, done, running, WORKER_CONCURRENCY);
    // Progress guard: a stall (circular/unmet deps, or every remaining task
    // conflicting) → force the first remaining task so the job never hangs.
    if (ready.length === 0 && running.size === 0 && done.size < tasks.length) {
      const rem = tasks.findIndex((_, i) => !done.has(i) && !running.has(i));
      if (rem >= 0) ready = [rem];
    }
    for (const idx of ready) {
      running.add(idx);
      inflight.set(
        idx,
        runAgentTurn({
          ws,
          userId,
          message: workerBrief(tasks[idx]!),
          mode: "build",
          verify: false,
          persist: false,
          intentId: intentId ?? undefined,
          scope: tasks[idx]!.scope,
        }).then((res) => ({ idx, res })),
      );
    }
  };

  launch();
  while (inflight.size > 0) {
    const { idx, res } = await Promise.race(inflight.values());
    inflight.delete(idx);
    running.delete(idx);
    done.add(idx);
    if (!("error" in res)) {
      res.changes.written.forEach((w) => written.add(w));
      res.changes.deleted.forEach((d) => deleted.add(d));
      tokens += res.tokensUsed ?? 0;
    }
    await checkpoint([...done], [...written], [...deleted]);
    launch();
  }

  return { complete: done.size >= tasks.length, done: [...done], written: [...written], deleted: [...deleted], tokens };
}

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

  // Job-level token ceiling (across slices) — stops a runaway refactor even for
  // an admin with a large quota. The per-worker budget check still applies first.
  if ((state.tokensSpent ?? 0) >= JOB_TOKEN_CAP) {
    await db().workspaceTask.update({
      where: { id },
      data: { status: "error", error: "Job token budget reached.", finishedAt: new Date() },
    });
    return { done: true, status: "error" };
  }

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

      // PLANNER: decompose into a PARALLEL worker batch + a reviewer (job grows).
      if (step.kind === "plan") {
        const planned = await planRefactor(ws, st.userId, step.message);
        const tasks: PlannedTask[] = planned.length
          ? planned
          : [{ title: "Build the change", scope: [], instruction: step.message }];
        const workers: JobStep = {
          kind: "workers",
          message: step.message,
          tasks,
          label: `Build · ${tasks.length} worker${tasks.length === 1 ? "" : "s"}`,
        };
        const review: JobStep = { kind: "review", message: step.message, round: 1, label: "Review" };
        return {
          ok: true,
          summary: `Planned ${tasks.length} sub-task${tasks.length === 1 ? "" : "s"}`,
          appendSteps: [workers, review],
        };
      }

      // WORKER BATCH: run the planned tasks in parallel (scope-disjoint) with
      // bounded concurrency; resumable across slices.
      if (step.kind === "workers") {
        const tasks = step.tasks ?? [];
        const group = await runWorkerGroup({
          ws,
          userId: st.userId,
          intentId: st.intentId,
          tasks,
          done: st.groupDone ?? [],
          deadline,
          checkpoint: async (doneArr, w, d) => {
            await db().workspaceTask.update({
              where: { id },
              data: {
                job: asJson({
                  ...st,
                  groupDone: doneArr,
                  written: uniq([...st.written, ...w]),
                  deleted: uniq([...st.deleted, ...d]),
                }),
              },
            });
          },
        });
        return {
          ok: true,
          incomplete: !group.complete,
          groupDone: group.done,
          written: group.written,
          deleted: group.deleted,
          tokensUsed: group.tokens,
          summary: group.complete
            ? `Ran ${tasks.length} worker${tasks.length === 1 ? "" : "s"}`
            : `Workers ${group.done.length}/${tasks.length}…`,
        };
      }

      // REVIEWER: gate the combined change; emit bounded rework or ship.
      if (step.kind === "review") {
        const round = step.round ?? 1;
        const r = await reviewJob({ ws, userId: st.userId, request: step.message, changed: st.written });
        if (r.ship || round >= MAX_REWORK_ROUNDS || r.fixes.length === 0) {
          // Shipping → one final best-effort build/verify pass if anything changed
          // (workers ran with verify:false for speed; this catches integration
          // errors across their separate edits).
          if (st.written.length > 0) {
            return {
              ok: true,
              summary: r.summary || "Reviewed — shipping.",
              appendSteps: [
                {
                  kind: "agentTurn",
                  message:
                    "Run the build and fix any compile/build errors so the whole project compiles and runs. " +
                    "Make only the minimal fixes needed across the files the change touched.",
                  mode: "build",
                  verify: true,
                  persist: false,
                  label: "Verify build",
                },
              ],
            };
          }
          return { ok: true, summary: r.summary || "Reviewed." };
        }
        const fixers = r.fixes.map(workerStep);
        const next: JobStep = {
          kind: "review",
          message: step.message,
          round: round + 1,
          label: `Review (round ${round + 1})`,
        };
        return {
          ok: true,
          summary: `Rework: ${r.fixes.length} fix${r.fixes.length === 1 ? "" : "es"}`,
          appendSteps: [...fixers, next],
        };
      }

      // WORKER / single-turn task.
      const res = await runAgentTurn({
        ws,
        userId: st.userId,
        message: step.message,
        mode: step.mode ?? "build",
        verify: step.verify ?? false,
        persist: step.persist ?? true,
        intentId: st.intentId ?? undefined,
        scope: step.scope,
      });
      if ("error" in res) return { ok: false, error: res.error };
      return {
        ok: true,
        summary: res.summary ?? res.text,
        written: res.changes.written,
        deleted: res.changes.deleted,
        tokensUsed: res.tokensUsed,
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

  // Finalize the whole-refactor intent (one undo for everything) when the job ends.
  if (terminal && outcome.state.intentId) {
    await db()
      .workspaceIntent.update({
        where: { id: outcome.state.intentId },
        data: { status: "final", reasoning: (last?.summary ?? "Refactor job").slice(0, 8000) },
      })
      .catch(() => {});
  }
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
