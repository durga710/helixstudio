import "server-only";

import vm from "node:vm";
import type { Workspace } from "@/generated/prisma/client";
import { execInSandbox } from "@/lib/runner/vercel-sandbox";
import { detectFramework } from "@/lib/app-runner";
import { pickPreviewEntry } from "@/lib/preview-html";
import { headlessCheckCommand } from "@/lib/runner/headless-check";
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
  /** Read a workspace file's content (for the in-process static syntax check). */
  readFile?: (path: string) => Promise<string | null>;
  /** Deep check: also run the app in a headless browser (on-demand only — the
   * "Verify build" button). The auto per-iteration verify leaves this off so it
   * stays cheap (no sandbox for static/games). */
  deep?: boolean;
}

/** Decide what to run to verify the build, or why it's skipped. */
export function selectVerifyCommand(
  treePaths: string[],
  pkgJson: string | null,
): { command: string } | { skip: string } {
  const detection = detectFramework(treePaths, pkgJson);
  if (detection.kind === "static" || detection.kind === "unknown") {
    // Godot games compile via Build & Play (a separate engine sandbox) — that
    // compile IS the verification; the standard runner has no Godot toolchain.
    if (treePaths.includes("project.godot")) {
      return { skip: "Godot games compile on Build & Play — press it to check it runs" };
    }
    // Static apps + CDN games (HTML + classic scripts): syntax-check every local
    // JS so a broken script is caught (and auto-fixed) instead of silently
    // shipping. The preview only runs classic global scripts, so `node --check`
    // (parse-only, no execution) is the right gate. No JS → nothing can break.
    const hasJs = treePaths.some((p) => /\.js$/i.test(p) && !p.startsWith("node_modules/"));
    if (hasJs) {
      return {
        command: "for f in $(find . -name '*.js' -not -path './node_modules/*'); do node --check $f || exit 1; done",
      };
    }
    return { skip: "static page — open the preview to see it live" };
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
 * Static apps + games: the cheap build-check runs IN-PROCESS — parse each local
 * script with `vm.Script` (compile-only, never executes the code, so browser
 * globals are fine). No sandbox → ~free per iteration. On a syntax error it runs
 * the same targeted fix loop. When `deep` (the on-demand Verify button) it ALSO
 * runs the headless browser check in the sandbox to catch runtime crashes.
 */
async function verifyStaticInProcess(ctx: VerifyContext): Promise<VerifyResult & { extraTokens: number }> {
  const maxAttempts = ctx.maxAttempts ?? 1;
  const jsFiles = ctx.treePaths.filter((p) => /\.js$/i.test(p) && !p.startsWith("node_modules/"));

  // Compile-check every local script; first syntax error wins.
  const syntaxScan = async (): Promise<{ ok: true } | { ok: false; log: string }> => {
    if (!ctx.readFile || jsFiles.length === 0) return { ok: true };
    for (const p of jsFiles) {
      const content = await ctx.readFile(p).catch(() => null);
      if (content == null) continue;
      try {
        new vm.Script(content, { filename: p });
      } catch (e) {
        return { ok: false, log: `${p}: ${e instanceof Error ? e.message : "syntax error"}` };
      }
    }
    return { ok: true };
  };

  let extraTokens = 0;
  let attempts = 0;
  let fixed = false;
  try {
    for (let i = 0; i <= maxAttempts; i++) {
      attempts++;
      ctx.emit(i === 0 ? "checking your scripts…" : "re-checking your scripts…");
      const scan = await syntaxScan();
      if (!scan.ok) {
        if (i >= maxAttempts) {
          return { status: "failed", command: "script syntax check", log: scan.log, fixed, attempts, extraTokens };
        }
        ctx.emit("fixing a script error…");
        const fix = await ctx.runFix(
          `A script has a syntax error:\n\n${scan.log}\n\nFix the code so the script parses. Make the smallest change.`,
        );
        if (!fix) {
          return { status: "failed", command: "script syntax check", log: scan.log, fixed, attempts, extraTokens };
        }
        absorbChanges(ctx.changes, fix.changes);
        ctx.actions.push(...fix.actions);
        extraTokens += fix.tokensUsed;
        fixed = true;
        continue;
      }

      // Scripts parse. Deep (on-demand) → run it in a headless browser to catch a
      // runtime crash / blank render. Best-effort: a sandbox/infra problem degrades
      // to "passed" (the syntax check already passed), never a false failure.
      if (ctx.deep) {
        const entry = pickPreviewEntry(ctx.treePaths) ?? "index.html";
        ctx.emit("running it in a headless browser…");
        const res = await execInSandbox(ctx.ws, headlessCheckCommand(entry));
        if (!("error" in res) && res.exitCode !== 0) {
          return {
            status: "failed",
            command: "headless runtime check",
            log: tailLog(res.stdout, res.stderr, LOG_STORE_CAP),
            fixed,
            attempts,
            extraTokens,
          };
        }
        return { status: "passed", command: "headless runtime check", fixed, attempts, extraTokens };
      }
      return { status: "passed", command: "script syntax check", fixed, attempts, extraTokens };
    }
    return { status: "passed", command: "script syntax check", attempts, extraTokens };
  } catch (e) {
    console.error("[helix-verify] in-process static check failed", e);
    return { status: "skipped", reason: "verify error", attempts, extraTokens };
  }
}

/**
 * Run the verify command; on failure, optionally ask the model to fix and
 * re-run, up to maxAttempts. `extraTokens` carries the fix-turn token cost back
 * to the caller for metering. Always best-effort: any unexpected error or an
 * unreachable sandbox degrades to "skipped", never throws.
 */
export async function verifyBuild(ctx: VerifyContext): Promise<VerifyResult & { extraTokens: number }> {
  const maxAttempts = ctx.maxAttempts ?? 1;

  // Static apps + games: verify IN-PROCESS (parse each script in our own server —
  // no sandbox, so the cheap per-iteration build-check costs nothing). The heavier
  // headless run-it-in-a-browser check only runs when `deep` (the on-demand Verify
  // button). Godot compiles on Build & Play.
  const detection = detectFramework(ctx.treePaths, ctx.pkgJson);
  if (detection.kind === "static" || detection.kind === "unknown") {
    if (ctx.treePaths.includes("project.godot")) {
      return { status: "skipped", reason: "Godot games compile on Build & Play — press it to check it runs", extraTokens: 0 };
    }
    const hasJs = ctx.treePaths.some((p) => /\.js$/i.test(p) && !p.startsWith("node_modules/"));
    if (hasJs) return verifyStaticInProcess(ctx);
    return { status: "skipped", reason: "static page — open the preview to see it live", extraTokens: 0 };
  }

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
  return { tool: "verify_skipped", label: result.reason ?? "ready to preview" };
}
