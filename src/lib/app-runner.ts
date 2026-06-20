import "server-only";

/**
 * App runner facade — the editor's Run button, backend-agnostic.
 *
 * Picks where the workspace actually executes:
 *   - local backend (./runner/local.ts): Helix running on the user's own
 *     machine (dev / self-hosted) — spawns the dev server locally, preview
 *     embeds localhost.
 *   - cloud backend (./runner/vercel-sandbox.ts): serverless deploys —
 *     ephemeral microVM with a public preview URL.
 *
 * Swapping cloud providers later (AWS etc.) means adding a backend file and
 * changing one line here — see the portability note in vercel-sandbox.ts.
 */

import type { Workspace } from "@/generated/prisma/client";
import { localBackend } from "./runner/local";
import { sandboxBackend, execInSandbox } from "./runner/vercel-sandbox";
import { execLocal, type ExecResult } from "./runner/local-exec";
import type { RunInfo, RunnerBackend } from "./runner/types";

export type { ExecResult } from "./runner/local-exec";

export type { RunInfo, RunStatus, Detection } from "./runner/types";
export { detectFramework } from "./runner/types";

/** True when apps can run on this machine itself (dev / self-hosted). */
export function runnerEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.HELIX_LOCAL_RUNNER === "1";
}

/**
 * True when the cloud sandbox backend is active (so push uses git-native
 * push, run_command executes, etc.). Mirrors backend() selection.
 */
export function usingSandboxBackend(): boolean {
  if (process.env.HELIX_RUNNER === "sandbox") return true;
  if (process.env.HELIX_RUNNER === "local") return false;
  return !runnerEnabled();
}

function backend(): RunnerBackend {
  // HELIX_RUNNER=sandbox|local overrides the default selection — handy for
  // exercising the cloud backend from local dev (needs VERCEL_OIDC_TOKEN).
  return usingSandboxBackend() ? sandboxBackend : localBackend;
}

export function startRun(ws: Workspace): Promise<RunInfo | { error: string }> {
  return backend().start(ws);
}

export function getRunInfo(ws: Workspace): Promise<RunInfo> {
  return backend().status(ws);
}

export function stopRun(workspaceId: string): Promise<void> {
  return backend().stop(workspaceId);
}

/**
 * Run one shell command in the workspace environment (the editor's terminal).
 * Routes to the same backend as the runner: a cloud microVM on serverless
 * deploys, a temp-dir child process on local dev / self-hosted. The workspace
 * copy is disposable — commands never mutate the stored files.
 */
export function execCommand(ws: Workspace, command: string): Promise<ExecResult> {
  return usingSandboxBackend() ? execInSandbox(ws, command) : execLocal(ws, command);
}
