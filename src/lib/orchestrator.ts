import "server-only";

/**
 * The multi-agent build pipeline — the REAL machinery behind the Watch Demo on
 * /welcome. Where runAgentTurn() is a single agent in one tool loop, this runs
 * the seven specialists the product promises, in order, each doing genuine work
 * and reporting a concrete result:
 *
 *   1. Planner            — a real model call: decomposes the request into a
 *                           numbered plan that is then fed to the Engineer.
 *   2. Repository Analyzer— static analysis of the current files (framework,
 *                           auth, database) — 0 tokens.
 *   3. Architect          — a real model call: picks the approach, grounded in
 *                           the plan + analysis; also fed to the Engineer.
 *   4. Engineer           — the existing build agent (runAgentTurn) that writes
 *                           the code and self-verifies (build/test) in a sandbox.
 *   5. Reviewer           — a real model call over the diff (runReviewer).
 *   6. Security Auditor    — real SAST + secret + dependency scan (auditFiles).
 *   7. Performance Auditor — real bundle/weight measurement (analyzePerf).
 *
 * Phases stream as `{ type: "phase", id, state, result, progress }` events on
 * the same NDJSON channel the chat route already uses, so the build UI can light
 * up agent lanes + a progress bar exactly like the demo. Every phase except the
 * Engineer degrades gracefully — a failed Planner/Architect/Reviewer never
 * blocks the build; the Engineer is the only must-succeed step.
 *
 * This is opt-in: the editor chat keeps its lean single turn; /build sends
 * `pipeline: true` and gets the full pipeline.
 */

import type { Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { GUEST_TOKEN_LIMIT } from "@/lib/auth";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import { resolveAiPrefs, runOneShot, runReviewer } from "@/lib/ai-agent";
import { checkTokenBudget } from "@/lib/token-budget";
import { aiUsageOps } from "@/lib/ai-usage";
import { auditFiles } from "@/lib/security/audit";
import { analyzePerf } from "@/lib/perf/analyze";
import { runAgentTurn, type TurnEvent, type TurnResult, type TurnError, type TurnAction } from "@/lib/agent-turn";

/* ----------------------------- agents ------------------------------ */

export type PipelinePhaseId =
  | "planner"
  | "analyzer"
  | "architect"
  | "engineer"
  | "reviewer"
  | "security"
  | "performance";

export type PhaseState = "working" | "complete" | "skipped";

/** A pipeline progress event, streamed alongside the engineer's TurnEvents. */
export interface PipelineEvent {
  type: "phase";
  id: PipelinePhaseId;
  state: PhaseState;
  /** Result line shown when the phase completes (the demo's "✓ …" lines). */
  result?: string;
  /** Overall pipeline progress 0–100. */
  progress?: number;
}

export type PipelineEmit = (e: TurnEvent | PipelineEvent) => void;

/** Progress the bar reaches when each phase COMPLETES (engineer is the big one). */
const PROGRESS: Record<PipelinePhaseId, number> = {
  planner: 14,
  analyzer: 36,
  architect: 50,
  engineer: 68,
  reviewer: 79,
  security: 90,
  performance: 100,
};

const PLAN_CAP = 1400; // chars of plan fed to the engineer
const REVIEW_DIFF_CAP = 14_000; // chars of changed code fed to the reviewer
const FILE_READ_CAP = 200_000; // per-file content cap for security/perf scans
const SCAN_FILE_CAP = 80; // max files read for security/perf

/* --------------------------- detection ----------------------------- */

interface StackInfo {
  framework: string;
  auth: string;
  database: string;
}

function detectStack(treePaths: string[], pkgJson: string | null): StackInfo {
  let deps: Record<string, string> = {};
  try {
    const parsed = JSON.parse(pkgJson ?? "{}") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    deps = { ...(parsed.devDependencies ?? {}), ...(parsed.dependencies ?? {}) };
  } catch {
    /* no/!parseable package.json */
  }
  const framework = deps.next
    ? "Next.js"
    : deps.react
      ? "React"
      : deps.vue
        ? "Vue"
        : deps.svelte
          ? "Svelte"
          : deps.express || deps.fastify || deps.hono
            ? "Node API"
            : treePaths.some((p) => p.endsWith(".py"))
              ? "Python"
              : treePaths.includes("index.html")
                ? "static site"
                : "app";
  const auth =
    deps["next-auth"] || deps["@auth/core"]
      ? "Auth.js"
      : deps.passport
        ? "Passport"
        : deps.jsonwebtoken
          ? "JWT"
          : "";
  const database =
    deps["@prisma/client"] || deps.prisma
      ? "Prisma"
      : deps["drizzle-orm"]
        ? "Drizzle"
        : deps.mongoose
          ? "MongoDB"
          : deps.pg
            ? "PostgreSQL"
            : "";
  return { framework, auth, database };
}

/* --------------------------- pipeline ------------------------------ */

export interface PipelineResult extends TurnResult {
  /** The per-agent outcome lines, in pipeline order (for persistence/UI). */
  phases: { id: PipelinePhaseId; result: string }[];
}

export async function runBuildPipeline(opts: {
  ws: Workspace;
  userId: string;
  message: string;
  briefPrefix?: string;
  verify?: boolean;
  onEvent?: PipelineEmit;
}): Promise<PipelineResult | TurnError> {
  const { ws, userId, onEvent } = opts;
  const userMessage = opts.message.trim();
  const emitPhase = (id: PipelinePhaseId, state: PhaseState, result?: string) =>
    onEvent?.({ type: "phase", id, state, result, progress: state === "complete" ? PROGRESS[id] : undefined });

  // One budget gate up front (the engineer re-checks, harmlessly).
  const budget = await checkTokenBudget(userId);
  if (!budget.ok) return { code: budget.code, error: budget.error };
  const dbUser = budget.user;
  // Guests never spend on the extra model calls (planner/architect/reviewer):
  // they get the computed phases + the engineer, which is already gated/pinned.
  const useModelPhases = !dbUser?.isGuest;

  const prefs = await resolveAiPrefs(userId);
  const gitAuth = await getGitAuth(userId, ws.provider);

  // Current file state (for the Planner's grounding + the Analyzer).
  const tree = await withGitAuth(gitAuth, () => listWorkspaceFiles(ws)).catch(() => [] as { path: string }[]);
  const treePaths = tree.map((f) => f.path);
  const pkgJson = treePaths.includes("package.json")
    ? await withGitAuth(gitAuth, () => readWorkspaceFile(ws, "package.json")).catch(() => null)
    : null;

  const phases: { id: PipelinePhaseId; result: string }[] = [];
  const phaseActions: TurnAction[] = [];
  let extraTokens = 0;
  const record = (id: PipelinePhaseId, result: string, log?: string) => {
    phases.push({ id, result });
    phaseActions.push({ tool: `agent_${id}`, label: result, ...(log ? { log } : {}) });
    emitPhase(id, "complete", result);
  };

  /* ---- 1. Planner ---- */
  emitPhase("planner", "working");
  let planText = "";
  if (useModelPhases && prefs.apiKey !== undefined) {
    const treeOutline = treePaths.slice(0, 60).join("\n") || "(empty — a starter will be scaffolded)";
    const r = await runOneShot({
      provider: prefs.provider,
      model: prefs.model,
      apiKey: prefs.apiKey,
      baseUrl: prefs.baseUrl,
      maxTokens: 700,
      system:
        "You are the Planner in a build pipeline. Decompose the user's request into a tight numbered " +
        "implementation plan (3-7 steps). Each step: what to build and the target file. No code, no preamble — " +
        "just the numbered list.",
      user: `REQUEST:\n${userMessage}\n\nCURRENT FILES:\n${treeOutline}`,
    });
    if (!("error" in r)) {
      planText = r.text.trim();
      extraTokens += r.tokensUsed;
    }
  }
  {
    const steps = (planText.match(/^\s*\d+[.)]/gm) ?? []).length;
    record("planner", steps > 0 ? `Plan ready — ${steps} step${steps === 1 ? "" : "s"}` : "Planned the build", planText || undefined);
  }

  /* ---- 2. Repository Analyzer (computed) ---- */
  emitPhase("analyzer", "working");
  {
    let result: string;
    if (treePaths.length === 0) {
      result = "Fresh workspace — scaffolding a starter";
    } else {
      const { framework, auth, database } = detectStack(treePaths, pkgJson);
      const found = [framework, auth, database].filter(Boolean);
      result = `Mapped ${treePaths.length} file${treePaths.length === 1 ? "" : "s"}${found.length ? ` — ${found.join(", ")}` : ""}`;
    }
    record("analyzer", result);
  }

  /* ---- 3. Architect ---- */
  emitPhase("architect", "working");
  let approach = "";
  if (useModelPhases && prefs.apiKey !== undefined) {
    const { framework } = detectStack(treePaths, pkgJson);
    const r = await runOneShot({
      provider: prefs.provider,
      model: prefs.model,
      apiKey: prefs.apiKey,
      baseUrl: prefs.baseUrl,
      maxTokens: 200,
      system:
        "You are the Architect in a build pipeline. In ONE short sentence (max 18 words), state the technical " +
        "approach for this build — the structure/pattern to use. No preamble.",
      user: `REQUEST:\n${userMessage}\n\nSTACK: ${framework}\n\nPLAN:\n${planText || "(none)"}`,
    });
    if (!("error" in r)) {
      approach = r.text.trim().replace(/\s+/g, " ").slice(0, 160);
      extraTokens += r.tokensUsed;
    }
  }
  record("architect", approach || "Designed the solution", approach || undefined);

  /* ---- 4. Engineer (the real build agent) ---- */
  emitPhase("engineer", "working");
  const planBrief = planText ? `IMPLEMENTATION PLAN (from the Planner — follow it):\n${planText.slice(0, PLAN_CAP)}\n\n` : "";
  const archBrief = approach ? `ARCHITECTURE (from the Architect): ${approach}\n\n` : "";
  const engineerBrief = planBrief + archBrief + (opts.briefPrefix ?? "");

  const eng = await runAgentTurn({
    ws,
    userId,
    message: userMessage,
    briefPrefix: engineerBrief || undefined,
    mode: "build",
    verify: opts.verify,
    // The engineer persists nothing here — the pipeline owns one combined
    // persistence below so the phase actions ride on the same message.
    persist: false,
    onEvent: (e) => onEvent?.(e),
  });
  if ("error" in eng) {
    emitPhase("engineer", "skipped");
    return eng;
  }
  const wrote = eng.changes.written.length;
  const del = eng.changes.deleted.length;
  const engResult =
    wrote > 0
      ? `Generated ${wrote} file${wrote === 1 ? "" : "s"}${del ? ` · removed ${del}` : ""}`
      : "No file changes";
  record("engineer", engResult);

  // Read the changed files once for the post-build auditors.
  const changedPaths = eng.changes.written.slice(0, SCAN_FILE_CAP);
  const changedFiles: { path: string; content: string }[] = [];
  for (const p of changedPaths) {
    const content = await withGitAuth(gitAuth, () => readWorkspaceFile(ws, p)).catch(() => null);
    if (content != null) changedFiles.push({ path: p, content: content.slice(0, FILE_READ_CAP) });
  }

  /* ---- 5. Reviewer ---- */
  emitPhase("reviewer", "working");
  {
    let result = wrote > 0 ? "Reviewed the changes" : "Nothing to review";
    let log: string | undefined;
    if (useModelPhases && wrote > 0 && prefs.apiKey !== undefined && changedFiles.length > 0) {
      let diff = "";
      for (const f of changedFiles) {
        const next = `\n=== ${f.path} ===\n${f.content}\n`;
        if (diff.length + next.length > REVIEW_DIFF_CAP) break;
        diff += next;
      }
      const r = await runReviewer({
        provider: prefs.provider,
        model: prefs.model,
        apiKey: prefs.apiKey,
        baseUrl: prefs.baseUrl,
        diffText: diff,
      });
      if (!("error" in r)) {
        extraTokens += r.tokensUsed;
        log = r.text;
        result = /verdict:\s*ship it/i.test(r.text) ? "No blocking issues — looks good" : "Flagged notes to review";
      }
    }
    record("reviewer", result, log);
  }

  /* ---- 6. Security Auditor (computed) ---- */
  emitPhase("security", "working");
  {
    const audit = auditFiles(changedFiles);
    const log =
      audit.findings.length > 0
        ? audit.findings
            .slice(0, 20)
            .map((f) => `[${f.severity}] ${f.path}:${f.line} — ${f.rule}: ${f.detail}`)
            .join("\n")
        : undefined;
    record("security", audit.summary, log);
  }

  /* ---- 7. Performance Auditor (computed) ---- */
  emitPhase("performance", "working");
  {
    const perf = analyzePerf(changedFiles.length > 0 ? changedFiles : []);
    const log =
      perf.findings.length > 0
        ? perf.findings.map((f) => `[${f.severity}] ${f.path} — ${f.detail}`).join("\n")
        : undefined;
    record("performance", changedFiles.length > 0 ? perf.summary : "No assets to weigh", log);
  }

  /* ---- persist: one user + one assistant message, all phase actions, usage ---- */
  const totalTokens = eng.tokensUsed + extraTokens;
  const actions = [...phaseActions, ...eng.actions];
  try {
    await db().$transaction([
      db().workspaceMessage.create({ data: { workspaceId: ws.id, role: "user", content: userMessage } }),
      db().workspaceMessage.create({
        data: {
          workspaceId: ws.id,
          role: "assistant",
          content: eng.text,
          actions,
          ...(eng.summary ? { summary: eng.summary } : {}),
        },
      }),
      ...aiUsageOps({
        userId,
        tokens: totalTokens,
        kind: "chat",
        provider: prefs.provider,
        model: prefs.model,
        workspaceId: ws.id,
      }),
    ]);
  } catch (e) {
    console.error("[orchestrator] persist failed", e);
  }

  const guestRemaining = dbUser?.isGuest
    ? Math.max(0, (dbUser.tokenLimit ?? GUEST_TOKEN_LIMIT) - (dbUser.tokensUsed + totalTokens))
    : null;

  return {
    text: eng.text,
    summary: eng.summary,
    actions,
    changes: eng.changes,
    tokensUsed: totalTokens,
    guestRemaining,
    verify: eng.verify,
    phases,
  };
}
