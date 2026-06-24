import "server-only";

/**
 * Turbo build — the orchestrator.
 *
 * The default engine runs ONE sequential tool-calling agent loop. With no prompt
 * caching on the GPT-OSS endpoint, that loop re-sends the whole growing
 * conversation on every hop, so its token cost is ~O(hops²) — the source of the
 * 150k–575k-token builds.
 *
 * Turbo changes the SHAPE:
 *   1. PLAN     — one strong-model call → a file manifest + a shared contract.
 *   2. GENERATE — each file by its own STATELESS one-shot call, in parallel.
 *                 No history, no tool loop → no re-send → O(files), not O(hops²).
 *   3. STITCH   — the deterministic fixers repair the cross-file seams that
 *                 independent generation inevitably leaves (casing, exports,
 *                 "use client", default exports) — zero tokens.
 *
 * Flag-gated (`HELIX_TURBO=1` + the per-request `turbo` flag) and SCRATCH-only
 * for now; any failure falls back to the proven sequential `runAgentTurn`.
 */

import type { Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { resolveAiPrefs } from "@/lib/ai-agent";
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFiles } from "@/lib/workspace";
import { checkTokenBudget, reserveTokenBudget, releaseTokenReservation } from "@/lib/token-budget";
import { aiUsageOps } from "@/lib/ai-usage";
import { synthesizeReply } from "@/lib/build-feed";
import { GUEST_TOKEN_LIMIT } from "@/lib/auth";
import { createAgentIntent } from "@/lib/intent-ledger";
import { ensureScaffold } from "@/lib/scaffold";
import { applyDeterministicFixes, verifyBuild, verifyMarker } from "@/lib/verify";
import { VERIFY_MAX_FIX_ATTEMPTS } from "@/lib/agent-config";
import { runAgentTurn, type TurnResult, type TurnError, type TurnEvent } from "@/lib/agent-turn";
import { planManifest } from "./manifest";
import { generateFile } from "./generate";
import { runPool, type AiPrefs } from "./parse";

/** Parallel leaf generators in flight at once. */
const LEAF_CONCURRENCY = 4;

/** Global on/off. Per-request `turbo` still has to be set too. */
export function turboEnabled(): boolean {
  return process.env.HELIX_TURBO === "1";
}

/** Route leaf generation to the cheaper/faster GPT-OSS 20B when the base model
 *  is the GPT-OSS 120B default — leaves do no tool-calling, so 20B fits. Any
 *  other model (a BYO key, etc.) generates leaves with the user's own choice. */
async function leafPrefs(base: AiPrefs): Promise<AiPrefs> {
  if (base.model !== "openai.gpt-oss-120b-1:0") return base;
  const { resolveBedrockModel } = await import("@/lib/ai/bedrock");
  const r = resolveBedrockModel("openai.gpt-oss-20b-1:0");
  if (!r) return base;
  return {
    provider: r.protocol === "anthropic" ? "anthropic" : "local",
    model: r.modelId,
    apiKey: r.apiKey,
    baseUrl: r.baseUrl,
    extraHeaders: r.headers,
  };
}

export interface TurboOpts {
  ws: Workspace;
  userId: string;
  message: string;
  onEvent?: (e: TurnEvent) => void;
  persist?: boolean;
}

/** True when turbo should handle this turn (else the caller uses the sequential path). */
export function shouldUseTurbo(ws: Workspace): boolean {
  return turboEnabled() && ws.mode === "SCRATCH";
}

/**
 * Run a build via the plan→parallel-generate→stitch path. Returns the same
 * TurnResult shape as runAgentTurn; falls back to runAgentTurn on any failure
 * (no manifest, no files generated) so a turbo miss is never a dead end.
 */
export async function runTurboBuild(opts: TurboOpts): Promise<TurnResult | TurnError> {
  const { ws, userId } = opts;
  const persist = opts.persist ?? true;
  const message = opts.message.trim();
  const emit = (label: string) => opts.onEvent?.({ type: "activity", label });

  // H4: the recording path atomically reserves so concurrent builds can't all
  // pass a read-only gate. A non-persisting nested run is metered by its parent.
  const budget = persist ? await reserveTokenBudget(userId) : await checkTokenBudget(userId);
  if (!budget.ok) return { code: budget.code, error: budget.error };
  const dbUser = budget.user;
  const reserved = budget.reserved;

  const prefs = await resolveAiPrefs(userId);
  const meter = { tokensUsed: 0 };

  // 0. SCAFFOLD — first build of an empty SCRATCH project gets the starter
  // skeleton (same injection the sequential path uses), so turbo generates the
  // delta on top of a real, runnable framework instead of from nothing.
  const currentFiles = await listWorkspaceFiles(ws).catch(() => []);
  const sc = await ensureScaffold({
    ws,
    userId,
    userMessage: message,
    currentFiles,
    emit,
    onScaffold: (files, stack) => opts.onEvent?.({ type: "scaffold", files, stack }),
    relist: () => listWorkspaceFiles(ws),
  });

  // 1. PLAN — one strong-model call.
  emit("planning the build…");
  const manifest = await planManifest(ws, userId, message, ws.notes, meter);
  if (!manifest) {
    // The sequential fallback re-reserves on its own — release ours first.
    await releaseTokenReservation(userId, reserved);
    return runAgentTurn(opts); // planner miss → proven sequential path
  }

  // 2. GENERATE — every file in parallel, each a stateless one-shot call.
  emit(`generating ${manifest.files.length} files in parallel…`);
  const leaves = await leafPrefs(prefs);
  const generated = await runPool(manifest.files, LEAF_CONCURRENCY, (spec) =>
    generateFile(leaves, manifest, spec, message, ws.notes),
  );
  const ok = generated.filter((g): g is Extract<typeof g, { content: string }> => "content" in g);
  for (const g of generated) meter.tokensUsed += g.tokensUsed;
  if (ok.length === 0) {
    await releaseTokenReservation(userId, reserved);
    return runAgentTurn(opts); // total miss → fall back
  }

  // 3. WRITE the generated files to the overlay (one intent for undo).
  const intentId = await createAgentIntent(ws, message).catch(() => null);
  const wrote = await writeWorkspaceFiles(
    ws,
    ok.map((g) => ({ path: g.path, content: g.content })),
    intentId ? { intentId } : undefined,
  );
  if ("error" in wrote) {
    await releaseTokenReservation(userId, reserved);
    return { error: wrote.error };
  }
  const changes = { written: [...wrote.writtenPaths], deleted: [] as string[] };
  // Fold the scaffold framework into the change set so the summary + "files
  // changed" card reflect the whole project, not just the generated delta.
  for (const p of sc.scaffoldPaths) if (!changes.written.includes(p)) changes.written.push(p);
  const generatedCount = wrote.writtenPaths.length;
  const actions: TurnResult["actions"] = [
    { tool: "write_files", label: `generated ${generatedCount} files in parallel` },
  ];
  const failed = generated.length - ok.length;
  if (failed > 0) actions.push({ tool: "write_files", label: `${failed} file(s) needed a follow-up` });

  // 4. STITCH — deterministic fixers repair the cross-file seams (0 tokens).
  const tree = await listWorkspaceFiles(ws).catch(() => []);
  await applyDeterministicFixes({
    treePaths: Array.from(new Set([...tree.map((f) => f.path), ...changes.written])),
    changes,
    actions,
    emit,
    readFile: (p) => readWorkspaceFile(ws, p).catch(() => null),
    writeFiles: (files) => writeWorkspaceFiles(ws, files, intentId ? { intentId } : undefined),
  });

  // 5. VERIFY — run the build in the sandbox and auto-fix once, exactly like the
  // sequential path (the fix turn is a normal runAgentTurn with verify off).
  // Best-effort: degrades to "skipped" when there's nothing to verify or the
  // sandbox is unreachable. Guests skip it (keeps trial cost down).
  let verify: TurnResult["verify"];
  if (!dbUser?.isGuest && changes.written.length > 0) {
    const treeAfter = await listWorkspaceFiles(ws).catch(() => tree);
    const pkgJson = await readWorkspaceFile(ws, "package.json").catch(() => null);
    const result = await verifyBuild({
      ws,
      treePaths: treeAfter.map((f) => f.path),
      pkgJson,
      changes,
      actions,
      emit,
      maxAttempts: VERIFY_MAX_FIX_ATTEMPTS,
      readFile: (p) => readWorkspaceFile(ws, p).catch(() => null),
      deep: false,
      runFix: async (fixMessage) => {
        const r = await runAgentTurn({
          ws,
          userId,
          message: fixMessage,
          persist: false,
          mode: "build",
          verify: false,
          intentId: intentId ?? undefined,
        });
        if ("error" in r) return null;
        return { changes: r.changes, actions: r.actions, tokensUsed: r.tokensUsed };
      },
    });
    meter.tokensUsed += result.extraTokens;
    const marker = verifyMarker(result);
    actions.push({ tool: marker.tool, label: marker.label, ...(marker.log ? { log: marker.log } : {}) });
    verify = { status: result.status, command: result.command, log: result.log };
  }

  const tokensUsed = meter.tokensUsed;
  const summary = synthesizeReply({
    changes,
    verify,
    userMessage: message,
    kind: ws.kind === "game" ? "game" : "app",
    isFirstBuild: sc.scaffolded,
    seed: ws.id,
  });
  const text = `Built ${generatedCount} files in parallel (turbo).`;

  if (persist) {
    try {
      await db().$transaction([
        db().workspaceMessage.create({ data: { workspaceId: ws.id, role: "user", content: message } }),
        db().workspaceMessage.create({
          data: { workspaceId: ws.id, role: "assistant", content: text, actions, summary },
        }),
        // reserved reconciles the up-front reservation to the true spend (H4).
        ...aiUsageOps({ userId, tokens: tokensUsed, kind: "chat", provider: prefs.provider, model: prefs.model, workspaceId: ws.id, reserved }),
      ]);
    } catch (e) {
      console.error("[turbo] persist failed", e);
      // Persist never settled the reservation — refund it so the turn isn't billed.
      await releaseTokenReservation(userId, reserved);
    }
  } else if (reserved > 0) {
    // Reserved but not recording here — refund (shouldn't happen: reserve is
    // gated on persist, but keep the counters honest if that ever changes).
    await releaseTokenReservation(userId, reserved);
  }

  if (intentId) {
    await db()
      .workspaceIntent.update({ where: { id: intentId }, data: { status: "final", reasoning: text.slice(0, 8000) } })
      .catch(() => {});
  }

  const guestRemaining = dbUser?.isGuest
    ? Math.max(0, (dbUser.tokenLimit ?? GUEST_TOKEN_LIMIT) - (dbUser.tokensUsed + tokensUsed))
    : null;

  return { text, summary, actions, changes, tokensUsed, guestRemaining, verify };
}
