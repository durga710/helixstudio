/**
 * Durable multi-step job types. The whole state machine is one JSON blob stored
 * in WorkspaceTask.job, advanced one "slice" at a time across serverless
 * invocations (see runner.ts / store.ts / driver.ts).
 */

export type JobStepKind = "agentTurn" | "plan" | "review" | "workers";

export interface JobStep {
  kind: JobStepKind;
  /** agentTurn: the worker message. plan/review: the original request. */
  message: string;
  mode?: "plan" | "build";
  verify?: boolean;
  /** Persist a chat message for this step (default true for single-step tasks;
   * Phase B workers set false — the job posts one final summary). */
  persist?: boolean;
  /** File scope this worker may write (globs). Empty = whole project. */
  scope?: string[];
  /** A short label for the live UI. */
  label?: string;
  /** review steps: the rework round (1-based). */
  round?: number;
  /** workers steps (Phase C): the parallel task batch (PlannedTask[]). */
  tasks?: import("./parse").PlannedTask[];
}

export interface JobStepResult {
  ok: boolean;
  summary?: string;
  written?: string[];
  deleted?: string[];
  error?: string;
  /** Steps to append to the job (a planner emits workers + a reviewer; a reviewer
   * emits rework steps). This is what makes a job dynamic. */
  appendSteps?: JobStep[];
  /** Phase C: the worker batch ran out of slice time — stay on this step and
   * resume next slice from `groupDone` instead of advancing the cursor. */
  incomplete?: boolean;
  /** Phase C: indices of workers in the current batch that have finished. */
  groupDone?: number[];
  /** Tokens this step spent (accumulated into JobState.tokensSpent). */
  tokensUsed?: number;
}

/** The durable state machine persisted in WorkspaceTask.job. */
export interface JobState {
  /** "task" (single-turn background task) | "refactor" (Phase B) | … */
  kind: string;
  /** Whose turn this runs as (WorkspaceTask has no userId column). */
  userId: string;
  steps: JobStep[];
  cursor: number; // index of the next step to run
  results: JobStepResult[]; // per-step outcomes (the checkpoint)
  written: string[]; // changes accumulated across steps
  deleted: string[];
  attempts: number; // slice attempts (for the backstop / retry)
  heartbeatAt?: string; // ISO — updated each step; staleness ⇒ rescue
  /** One intent groups EVERY write across the job into a single undo. */
  intentId?: string | null;
  /** Phase C: completed worker indices in the in-progress parallel batch
   * (so a slice timeout resumes the rest, not the whole batch). */
  groupDone?: number[];
  /** Total tokens spent across all steps (Phase D — cost display + JOB_TOKEN_CAP). */
  tokensSpent?: number;
}

export type JobStatus = "queued" | "running" | "reviewing" | "done" | "error" | "canceled";

/** Outcome of running one slice. */
export interface SliceOutcome {
  status: JobStatus;
  state: JobState;
}
