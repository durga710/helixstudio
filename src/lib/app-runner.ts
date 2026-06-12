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
import { sandboxBackend } from "./runner/vercel-sandbox";
import type { RunInfo, RunnerBackend } from "./runner/types";

export type { RunInfo, RunStatus, Detection } from "./runner/types";
export { detectFramework } from "./runner/types";

/** True when apps can run on this machine itself (dev / self-hosted). */
export function runnerEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.HELIX_LOCAL_RUNNER === "1";
}

function backend(): RunnerBackend {
  // HELIX_RUNNER=sandbox|local overrides the default selection — handy for
  // exercising the cloud backend from local dev (needs VERCEL_OIDC_TOKEN).
  if (process.env.HELIX_RUNNER === "sandbox") return sandboxBackend;
  if (process.env.HELIX_RUNNER === "local") return localBackend;
  return runnerEnabled() ? localBackend : sandboxBackend;
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
