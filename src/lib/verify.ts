import "server-only";

import type { Workspace } from "@/generated/prisma/client";
import { execInSandbox } from "@/lib/runner/vercel-sandbox";
import { detectFramework } from "@/lib/app-runner";
import type { ChangeManifest } from "@/lib/workspace-tools";

/** Merge a fix turn's manifest into the outer one (dedup; deletions win). */
function absorbChanges(into: ChangeManifest, from: ChangeManifest): void {
  for (const p of from.written) if (!into.written.includes(p)) into.written.push(p);
  for (const p of from.deleted) {
    if (!into.deleted.includes(p)) into.deleted.push(p);
    into.written = into.written.filter((w) => w !== p);
  }
}

/**
 * Self-verifying agent: after a build turn writes files, run the project in the
 * sandbox, read build/test errors, and (optionally) feed them back to the model
 * to fix — until it works or it honestly reports what's broken. Completes the
 * Plan → Build → Verify story. Skips (never fails the turn) when there's nothing
 * to verify or the sandbox is unavailable.
 */

const LOG_FEED_CAP = 8_000; // fed back to the model on a failure
const LOG_STORE_CAP = 4_000; // persisted on the message (JSONB stays small)

export interface VerifyResult {
  status: "passed" | "failed" | "skipped";
  command?: string;
  log?: string; // tail of stdout+stderr (capped)
  fixed?: boolean; // a fix attempt changed files and the re-run passed
  attempts?: number; // verify runs performed
  reason?: string; // why it skipped
}

export interface VerifyContext {
  ws: Workspace;
  treePaths: string[];
  pkgJson: string | null;
  /** Outer turn's manifest — fixes merge in here so the UI refreshes them. */
  changes: ChangeManifest;
  /** Outer turn's actions — fix-turn actions append here. */
  actions: { tool: string; label: string; log?: string }[];
  emit: (label: string) => void;
  /**
   * Injected by agent-turn.ts (avoids a circular import): runs one build-mode
   * fix turn against the given message and returns its changes/actions/tokens,
   * or null if it produced nothing.
   */
  runFix: (
    message: string,
  ) => Promise<{
    changes: ChangeManifest;
    actions: { tool: string; label: string; log?: string }[];
    tokensUsed: number;
  } | null>;
  /** Fix attempts (re-runs) allowed. 0 = run once, never fix. */
  maxAttempts?: number;
}

/** Decide what to run to verify the build, or why it's skipped. */
export function selectVerifyCommand(
  treePaths: string[],
  pkgJson: string | null,
): { command: string } | { skip: string } {
  const detection = detectFramework(treePaths, pkgJson);
  if (detection.kind === "static" || detection.kind === "unknown") {
    return { skip: "static site — open the preview to check it" };
  }
  if (detection.kind === "python") {
    // Django: the management CLI's own system check (fast, no test files needed).
    if (treePaths.includes("manage.py")) return { command: "python manage.py check" };
    // Real tests present → run them. Module form works whenever pytest is on
    // the path (installed via requirements.txt in the setup step).
    const hasTests = treePaths.some(
      (p) =>
        /(^|\/)conftest\.py$/.test(p) ||
        /(^|\/)tests?\//.test(p) ||
        /(^|\/)test_[^/]+\.py$/.test(p) ||
        /_test\.py$/.test(p),
    );
    if (hasTests) return { command: "python -m pytest -q" };
    // No tests — a byte-compile of the project is a dependency-free syntax/
    // import smoke test that catches the most common breakage.
    return { command: "python -m compileall -q ." };
  }
  // node
  let scripts: Record<string, string> = {};
  try {
    scripts = (JSON.parse(pkgJson ?? "{}") as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    /* unparseable package.json — treat as no scripts */
  }
  if (scripts.build) return { command: "npm run build" };
  if (scripts.test) return { command: "npm test" };
  return { skip: "no build or test script — nothing to verify" };
}

/** Combined, tail-capped log from an exec result. */
function tailLog(stdout: string, stderr: string, cap: number): string {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return combined.length > cap ? combined.slice(combined.length - cap) : combined;
}

/**
 * Run the verify command; on failure, optionally ask the model to fix and
 * re-run, up to maxAttempts. `extraTokens` carries the fix-turn token cost back
 * to the caller for metering. Always best-effort: any unexpected error or an
 * unreachable sandbox degrades to "skipped", never throws.
 */
export async function verifyBuild(ctx: VerifyContext): Promise<VerifyResult & { extraTokens: number }> {
  const maxAttempts = ctx.maxAttempts ?? 1;
  const sel = selectVerifyCommand(ctx.treePaths, ctx.pkgJson);
  if ("skip" in sel) {
    return { status: "skipped", reason: sel.skip, extraTokens: 0 };
  }
  const command = sel.command;
  let extraTokens = 0;
  let attempts = 0;
  let fixed = false;

  try {
    for (let i = 0; i <= maxAttempts; i++) {
      attempts++;
      ctx.emit(i === 0 ? `verifying — \`${command}\`…` : `re-running \`${command}\`…`);
      const res = await execInSandbox(ctx.ws, command);

      if ("error" in res) {
        // Sandbox not reachable / env not ready — skip, don't fail the turn.
        return { status: "skipped", command, reason: "couldn't reach the sandbox", attempts, extraTokens };
      }
      if (res.exitCode === 0) {
        return {
          status: "passed",
          command,
          log: tailLog(res.stdout, res.stderr, LOG_STORE_CAP),
          fixed,
          attempts,
          extraTokens,
        };
      }

      // Failed. Out of fix attempts → report honestly.
      if (i >= maxAttempts) {
        return {
          status: "failed",
          command,
          log: tailLog(res.stdout, res.stderr, LOG_STORE_CAP),
          fixed,
          attempts,
          extraTokens,
        };
      }

      // Feed the error back to the model to fix.
      ctx.emit("fixing a build error…");
      const feed = tailLog(res.stdout, res.stderr, LOG_FEED_CAP);
      const fix = await ctx.runFix(
        `Verification failed running \`${command}\`:\n\n${feed}\n\n` +
          "Fix the code so the command succeeds. Make the smallest change that resolves the error.",
      );
      if (!fix) {
        // Model produced no change — re-running would just fail again.
        return {
          status: "failed",
          command,
          log: tailLog(res.stdout, res.stderr, LOG_STORE_CAP),
          fixed,
          attempts,
          extraTokens,
        };
      }
      absorbChanges(ctx.changes, fix.changes);
      ctx.actions.push(...fix.actions);
      extraTokens += fix.tokensUsed;
      fixed = true;
    }
    // Unreachable, but satisfy the type.
    return { status: "failed", command, attempts, extraTokens };
  } catch (e) {
    console.error("[helix-verify] phase failed", e);
    return { status: "skipped", command, reason: "verify error", attempts, extraTokens };
  }
}

/** A human label + persisted marker tool name for the message's actions JSONB. */
export function verifyMarker(result: VerifyResult): { tool: string; label: string; log?: string } {
  if (result.status === "passed") {
    return { tool: "verified", label: result.fixed ? "verified (auto-fixed)" : "verified", log: result.log };
  }
  if (result.status === "failed") {
    return { tool: "verify_failed", label: "couldn't verify", log: result.log };
  }
  return { tool: "verify_skipped", label: `verify skipped — ${result.reason ?? "nothing to verify"}` };
}
