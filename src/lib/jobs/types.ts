/**
 * Durable multi-step job types. The whole state machine is one JSON blob stored
 * in WorkspaceTask.job, advanced one "slice" at a time across serverless
 * invocations (see runner.ts / store.ts / driver.ts).
 */

export type JobStepKind = "agentTurn";

export interface JobStep {
  kind: JobStepKind;
  /** The instruction for this step (an agentTurn message / worker brief). */
  message: string;
  mode?: "plan" | "build";
  verify?: boolean;
  /** Persist a chat message for this step (default true for single-step tasks;
   * Phase B workers set false). */
  persist?: boolean;
  /** Phase B: file scope this worker may write (globs). Empty = whole project. */
  scope?: string[];
  /** A short label for the live UI. */
  label?: string;
}

export interface JobStepResult {
  ok: boolean;
  summary?: string;
  written?: string[];
  deleted?: string[];
  error?: string;
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
}

export type JobStatus = "queued" | "running" | "reviewing" | "done" | "error" | "canceled";

/** Outcome of running one slice. */
export interface SliceOutcome {
  status: JobStatus;
  state: JobState;
}
