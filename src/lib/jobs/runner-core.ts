/**
 * Pure slice runner — no DB, no model. Given a job state + an executor + a
 * deadline, it runs steps from the cursor until the deadline (or the job
 * finishes), checkpointing after each step via onCheckpoint. Kept dependency-free
 * so the durable state machine is unit-testable. store.ts wires the real DB +
 * agent executor; runner.ts is the top-level glue.
 */

import type { JobState, JobStepResult, SliceOutcome } from "./types";

export interface SliceDeps {
  /** Run one step; resolves to its result (never throws — wrap errors). */
  execute: (state: JobState, stepIndex: number) => Promise<JobStepResult>;
  /** Persist the state after each step (checkpoint). */
  onCheckpoint: (state: JobState) => Promise<void>;
  /** Has the job been canceled out-of-band? Checked before each step. */
  isCanceled?: () => Promise<boolean>;
  /** Wall clock (injectable for tests). */
  now?: () => number;
  /** Stop starting new steps once now() >= deadline. */
  deadline: number;
}

const dedup = (a: string[]) => Array.from(new Set(a));

/**
 * Advance the job by as many steps as fit before the deadline. Returns the new
 * status + state. Caller persists the final state and, if still "running",
 * triggers the next slice.
 */
export async function runSlice(state: JobState, deps: SliceDeps): Promise<SliceOutcome> {
  const now = deps.now ?? Date.now;
  let s: JobState = { ...state, attempts: state.attempts + 1 };

  while (s.cursor < s.steps.length) {
    if (now() >= deps.deadline) {
      // Out of time this slice — stay "running"; the next slice resumes here.
      return { status: "running", state: s };
    }
    if (deps.isCanceled && (await deps.isCanceled())) {
      return { status: "canceled", state: s };
    }

    s = { ...s, heartbeatAt: new Date(now()).toISOString() };
    let result: JobStepResult;
    try {
      result = await deps.execute(s, s.cursor);
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "step failed" };
    }

    // A parallel worker batch that ran out of slice time: record progress + group
    // state, DON'T advance the cursor, and resume this same step next slice.
    if (result.incomplete) {
      s = {
        ...s,
        written: result.written ? dedup([...s.written, ...result.written]) : s.written,
        deleted: result.deleted ? dedup([...s.deleted, ...result.deleted]) : s.deleted,
        groupDone: result.groupDone ?? s.groupDone,
        tokensSpent: (s.tokensSpent ?? 0) + (result.tokensUsed ?? 0),
        heartbeatAt: new Date(now()).toISOString(),
      };
      await deps.onCheckpoint(s);
      return { status: "running", state: s };
    }

    s = {
      ...s,
      // Completed step → the parallel batch (if any) is done; clear group state.
      groupDone: [],
      tokensSpent: (s.tokensSpent ?? 0) + (result.tokensUsed ?? 0),
      results: [...s.results, result],
      written: result.written ? dedup([...s.written, ...result.written]) : s.written,
      deleted: result.deleted ? dedup([...s.deleted, ...result.deleted]) : s.deleted,
      // A planner/reviewer can grow the job (workers, rework) — append in place
      // so the loop keeps going past the original step count.
      steps: result.appendSteps?.length ? [...s.steps, ...result.appendSteps] : s.steps,
      cursor: s.cursor + 1,
      heartbeatAt: new Date(now()).toISOString(),
    };
    await deps.onCheckpoint(s);

    if (!result.ok) {
      // A failed step ends the job (Phase B's reviewer will turn this into a
      // targeted rework loop instead of a hard stop).
      return { status: "error", state: s };
    }
  }

  return { status: "done", state: s };
}
