import "server-only";

/**
 * One agent turn, callable from anywhere: the streaming chat route, the
 * background task runner, and the change reviewer all run THIS. It owns
 * provider/model/key resolution, guest metering, context assembly
 * (chat-context engine + AGENTS.md project instructions), the provider
 * dispatch incl. the OpenAI Responses hop loop, the inline-write salvage,
 * and persistence.
 *
 * Streaming: pass `onEvent` to receive live activity labels (tool starts,
 * thinking) — token-level deltas are a future upgrade; the final text
 * arrives in the returned result.
 */

import OpenAI from "openai";
import type { Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { GUEST_TOKEN_LIMIT } from "@/lib/auth";
import { getGitAuth, withGitAuth, PROVIDER_META, getProvider } from "@/lib/git";
import { OPENAI_MODEL } from "@/lib/openai";
import { resolveAiKey, GEMINI_BASE_URL } from "@/lib/ai/keys";
import { isAdminEmail } from "@/lib/admin";
import {
  workspaceTools,
  executeTool,
  toolLabel,
  mergeChanges,
  salvageInlineFileWrites,
  type ChangeManifest,
  type ToolContext,
} from "@/lib/workspace-tools";
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFiles } from "@/lib/workspace";
import { getTemplate } from "@/lib/templates/store";
import { buildTemplateNote } from "@/lib/templates/router";
import { personalizeTemplateFiles } from "@/lib/templates/personalize";
import { resolveTemplateId } from "@/lib/templates/select";
import { setProgress, clearProgress } from "@/lib/progress";
import { usingSandboxBackend, runnerEnabled } from "@/lib/app-runner";
import { verifyBuild, verifyMarker } from "@/lib/verify";
import { runAnthropicAgent, runLocalAgent, runToolCalls, PROVIDER_DEFAULT_MODEL } from "@/lib/ai-agent";
import { withRetry } from "@/lib/ai/retry";
import { createAgentIntent } from "@/lib/intent-ledger";
import {
  AGENT_LIMITS,
  BUILD_RULES,
  PLAN_RULES,
  VERIFY_DEFAULT_ON,
  VERIFY_MAX_FIX_ATTEMPTS,
  toolResultCapFor,
} from "@/lib/agent-config";
import { checkTokenBudget, type BudgetCode } from "@/lib/token-budget";
import { aiUsageOps } from "@/lib/ai-usage";
import {
  stackLine,
  treeOutline,
  historyContext,
  fitBudget,
  estimateTokens,
  INSTRUCTIONS_MAX,
} from "@/lib/chat-context";
import { composeDigest } from "@/lib/conversation-memory";

// 40 rows feed the context engine: the newest 8 go verbatim, the rest
// become a one-line-per-turn digest (see src/lib/chat-context.ts).
const HISTORY_LIMIT = 40;

export type TurnEvent = { type: "activity"; label: string } | { type: "delta"; text: string };

/** A tool/marker shown under a message. `log` rides on verify markers only. */
export type TurnAction = { tool: string; label: string; log?: string };

export interface TurnResult {
  text: string;
  actions: TurnAction[];
  changes: ChangeManifest;
  tokensUsed: number;
  guestRemaining: number | null;
  /** Set when the build was verified (ran in the sandbox). */
  verify?: { status: "passed" | "failed" | "skipped"; command?: string; log?: string };
}

export type TurnError = { error: string; code?: BudgetCode };

export async function runAgentTurn(opts: {
  ws: Workspace;
  userId: string;
  message: string;
  onEvent?: (e: TurnEvent) => void;
  /** Write user+assistant messages and meter tokens (default true). */
  persist?: boolean;
  /** "plan": read-only tools + the agent replies with a numbered plan the
   * user approves before a normal build turn executes it. Default "build". */
  mode?: "plan" | "build";
  /** After a build that wrote files, run + verify it in the sandbox (auto-fix
   * up to maxAttempts). Default false. Nested fix turns MUST pass false to
   * stop infinite verify recursion. */
  verify?: boolean;
  /** Fix attempts for the verify loop (only meaningful when verify is true). */
  verifyMaxAttempts?: number;
  /** Intent-ledger: fold this turn's writes into an existing intent instead
   * of creating a new one (verify fix turns pass the parent's). */
  intentId?: string;
  /** A model-only instruction prefix (e.g. the build studio's scaffold brief).
   * The model sees `briefPrefix + message`, but only the clean `message` is
   * persisted and shown — internal prompts must never leak into the chat UI. */
  briefPrefix?: string;
}): Promise<TurnResult | TurnError> {
  const { ws, userId, onEvent } = opts;
  const persist = opts.persist ?? true;
  const mode = opts.mode ?? "build";
  const userMessage = opts.message.trim();
  const emit = (label: string) => onEvent?.({ type: "activity", label });
  // Live token deltas of the assistant's reply (streaming providers call this).
  const onText = (text: string) => onEvent?.({ type: "delta", text });

  // Token budget: suspension, admin per-user limits, tier monthly quotas and
  // the guest allowance — all checked in one place before any AI spend.
  const budget = await checkTokenBudget(userId);
  if (!budget.ok) return { code: budget.code, error: budget.error };
  const dbUser = budget.user;

  const prefs = await db().userPreferences.findUnique({
    where: { userId },
    select: {
      aiProvider: true,
      aiModel: true,
      aiBaseUrl: true,
      openaiKey: true,
      anthropicKey: true,
      localKey: true,
      geminiKey: true,
      user: { select: { email: true } },
    },
  });
  let aiProvider = prefs?.aiProvider ?? "openai";
  // "default" was a broken literal an old picker saved — treat as unset.
  const prefModel = prefs?.aiModel === "default" ? "" : (prefs?.aiModel ?? "");
  let aiModel = prefModel || PROVIDER_DEFAULT_MODEL[aiProvider] || "";
  let aiBaseUrl = prefs?.aiBaseUrl || "http://localhost:1234/v1";
  // Per-provider keys: switching provider can never send the wrong vendor's key.
  // Key resolution goes through resolveAiKey — the user's OWN key always works;
  // the platform (env) key resolves ONLY for admins, so a fresh signup can
  // never spend our keys.
  const isAdmin = isAdminEmail(prefs?.user?.email);
  const ownKey =
    aiProvider === "openai"
      ? prefs?.openaiKey
      : aiProvider === "anthropic"
        ? prefs?.anthropicKey
        : aiProvider === "gemini"
          ? prefs?.geminiKey
          : prefs?.localKey;
  let memberKey = resolveAiKey({ provider: aiProvider, userKey: ownKey, isAdmin });

  // Guest beta model: when GUEST_AI_PROVIDER is set, ALL guests are pinned to
  // it (e.g. a local LM Studio model) so trial traffic never spends the
  // workspace's paid API keys. Signed-in users are unaffected.
  if (dbUser?.isGuest && process.env.GUEST_AI_PROVIDER) {
    aiProvider = process.env.GUEST_AI_PROVIDER;
    aiModel = process.env.GUEST_AI_MODEL || PROVIDER_DEFAULT_MODEL[aiProvider] || "";
    aiBaseUrl = process.env.GUEST_AI_BASE_URL || aiBaseUrl;
    memberKey = undefined;
  }

  const ai = aiProvider === "openai" && memberKey ? new OpenAI({ apiKey: memberKey }) : null;
  if (aiProvider === "openai" && !ai) {
    return { error: "AI is not configured — add your own API key in Settings → AI model." };
  }

  const gitAuth = await getGitAuth(userId, ws.provider);

  // Context engine (src/lib/chat-context.ts): instead of resending the full
  // tree and 30 verbatim messages every turn, the model gets a stack line, a
  // collapsed tree outline, its own curated PROJECT NOTES, the repo's
  // AGENTS.md/CLAUDE.md, a digest of older turns, and a short verbatim
  // window — under a hard input budget.
  emit("reading the workspace…");
  let tree = await withGitAuth(gitAuth, () => listWorkspaceFiles(ws)).catch(() => []);
  let treePaths = tree.map((f) => f.path);

  // First build turn on an EMPTY from-scratch workspace → inject the premium-gated
  // starter from the user's idea BEFORE building, so the agent customizes a real
  // skeleton (cheap) and the preview renders instead of staying blank. Covers any
  // path that reaches the agent empty (e.g. "Create from scratch" → first chat).
  if (mode === "build" && ws.mode === "SCRATCH" && treePaths.length === 0 && !ws.notes && userMessage) {
    try {
      const templateId = await resolveTemplateId({
        prompt: userMessage,
        userId,
        buildKind: ws.kind === "game" ? "game" : "app",
      });
      const tpl = templateId ? await getTemplate(templateId) : undefined;
      if (tpl) {
        emit("scaffolding a starter…");
        const note = buildTemplateNote(tpl);
        const tplFiles = personalizeTemplateFiles(tpl.files, { appName: ws.name });
        await writeWorkspaceFiles(ws, tplFiles.map((f) => ({ path: f.path, content: f.content })));
        await db().workspace.update({ where: { id: ws.id }, data: { notes: note } });
        ws.notes = note; // reflect it in this turn's context
        tree = await withGitAuth(gitAuth, () => listWorkspaceFiles(ws)).catch(() => tree);
        treePaths = tree.map((f) => f.path);
      }
    } catch {
      // best-effort — fall through to building from scratch
    }
  }

  const pkgJson = treePaths.includes("package.json")
    ? await withGitAuth(gitAuth, () => readWorkspaceFile(ws, "package.json")).catch(() => null)
    : null;

  // Project instruction files — same convention Codex/Claude honor.
  let instructionsDoc = "";
  for (const candidate of ["AGENTS.md", "CLAUDE.md"]) {
    if (!treePaths.includes(candidate)) continue;
    const doc = await withGitAuth(gitAuth, () => readWorkspaceFile(ws, candidate)).catch(() => null);
    if (doc?.trim()) {
      instructionsDoc = doc.trim().slice(0, INSTRUCTIONS_MAX);
      break;
    }
  }

  const history = await db().workspaceMessage.findMany({
    where: { workspaceId: ws.id },
    orderBy: { createdAt: "desc" },
    select: { role: true, content: true, actions: true, createdAt: true },
    take: HISTORY_LIMIT,
  });
  // Older turns already folded into ws.convoSummary are dropped from the
  // deterministic digest; what remains is the not-yet-folded gap. The two stack
  // into one "working memory" block (see conversation-memory.ts).
  const { digest, recent } = historyContext(
    history.reverse(),
    undefined,
    undefined,
    ws.convoSummaryAt,
  );
  const memory = composeDigest(ws.convoSummary, digest);

  // Prompts live in agent-config.ts so the /admin overview shows the exact
  // text the model receives.
  const rules = mode === "plan" ? PLAN_RULES : BUILD_RULES;

  const fitted = fitBudget({
    rules,
    workspaceMeta:
      `Name: ${ws.name}\n` +
      `Mode: ${ws.mode === "IMPORT" ? `imported from ${PROVIDER_META[getProvider(ws.provider).name].label} repo ${ws.repo} @ ${ws.baseBranch} (edits overlay the repo until pushed)` : "built from scratch (files live here until pushed to a git host)"}`,
    stack: stackLine(treePaths, pkgJson),
    tree: treeOutline(treePaths),
    notes: ws.notes ?? "",
    instructionsDoc,
    digest: memory,
    recent,
    userMessage,
    treePaths,
  });

  const instructions =
    fitted.rules +
    "\n--- WORKSPACE ---\n" +
    `${fitted.workspaceMeta}\n` +
    `${fitted.stack}\n` +
    `Files (${tree.length}):\n${fitted.tree}` +
    (fitted.instructionsDoc
      ? `\n\n--- PROJECT INSTRUCTIONS (from the repo's AGENTS.md/CLAUDE.md — follow them) ---\n${fitted.instructionsDoc}`
      : "") +
    (fitted.notes ? `\n\n--- PROJECT NOTES (yours — update via remember) ---\n${fitted.notes}` : "") +
    (fitted.digest ? `\n\n--- EARLIER CONVERSATION (working memory) ---\n${fitted.digest}` : "");

  // The model sees the (optional) brief prefix; persistence/UI only ever see the
  // clean userMessage, so internal instructions never surface in the chat.
  const modelMessage = (opts.briefPrefix ?? "") + userMessage;
  const messages = [...fitted.recent, { role: "user" as const, content: modelMessage }];

  if (process.env.NODE_ENV === "development") {
    const msgChars = messages.reduce((n, m) => n + m.content.length, 0);
    console.log(
      `[helix-chat] context: rules=${fitted.rules.length} tree=${fitted.tree.length} notes=${fitted.notes.length} ` +
        `agentsmd=${fitted.instructionsDoc.length} digest=${fitted.digest.length} recent=${fitted.recent.length}msg/${msgChars}ch ` +
        `≈${estimateTokens(instructions.length + msgChars)} input tokens`,
    );
  }

  // Intent ledger: the turn's intent is created lazily on the first mutating
  // tool call, so read-only turns leave no trace. Verify fix turns inherit
  // the parent's intent via opts.intentId; only the creator finalizes it.
  let intentId: string | null = opts.intentId ?? null;
  let createdIntentId: string | null = null;
  const getIntentId =
    mode === "build"
      ? async () => {
          if (intentId) return intentId;
          const id = await createAgentIntent(ws, userMessage);
          if (id) {
            intentId = id;
            createdIntentId = id;
          }
          return id;
        }
      : undefined;

  // Prime the tool cache with the tree we already fetched — list_files inside
  // this turn reuses it instead of refetching (writes invalidate).
  const ctx: ToolContext = {
    userId,
    workspaceId: ws.id,
    cache: { tree },
    onActivity: (label) => emit(label),
    mode,
    getIntentId,
  };
  setProgress(ws.id, "reading your message…");
  emit("thinking…");

  let text: string;
  let actions: TurnAction[];
  let changes: ChangeManifest;
  let tokensUsed = 0;
  try {
    if (aiProvider === "anthropic" || aiProvider === "local" || aiProvider === "gemini") {
      // Gemini speaks the OpenAI chat API over a fixed base URL, so it runs
      // through the same OpenAI-compatible runner as the local provider.
      const result = await withGitAuth(gitAuth, () =>
        aiProvider === "anthropic"
          ? runAnthropicAgent({ model: aiModel, instructions, messages, ctx, apiKey: memberKey, onText })
          : runLocalAgent({
              model: aiModel,
              baseUrl: aiProvider === "gemini" ? GEMINI_BASE_URL : aiBaseUrl,
              instructions,
              messages,
              ctx,
              apiKey: memberKey,
              label: aiProvider === "gemini" ? "Gemini" : "the local model",
            }),
      );
      if ("error" in result) return { error: result.error };
      ({ text, actions, changes, tokensUsed } = result);
    } else {
      // OpenAI Responses API with multi-hop function tools.
      actions = [];
      changes = { written: [], deleted: [] };
      // Stream the reply token-by-token; on any streaming error fall back to a
      // normal (retried) create so a streaming bug can never break chat.
      //
      // Context-safety: the fallback re-issues the SAME `params` — including
      // `previous_response_id` (which points at the prior hop's ALREADY-STORED
      // response) and the same tool outputs — so no tool context is dropped; the
      // retry cleanly redoes the failed hop. A partial stream-then-error only
      // double-emits some onText deltas mid-turn (cosmetic — the client replaces
      // the streamed buffer with the final message), never the persisted reply.
      const oai = ai!;
      const streamOrCreate = async (
        params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
      ): Promise<OpenAI.Responses.Response> => {
        try {
          const s = oai.responses.stream(params as Parameters<typeof oai.responses.stream>[0]);
          for await (const ev of s) {
            if (ev.type === "response.output_text.delta") onText(ev.delta);
          }
          return await s.finalResponse();
        } catch {
          return withRetry(() => oai.responses.create(params));
        }
      };
      try {
        let resp = await streamOrCreate({
          model: aiModel || OPENAI_MODEL,
          instructions,
          input: messages,
          tools: workspaceTools(mode),
          store: true,
        });
        tokensUsed += resp.usage?.total_tokens ?? 0;

        for (const item of resp.output ?? []) {
          if (item.type === "web_search_call") actions.push({ tool: "web_search", label: toolLabel("web_search", null) });
        }

        // Tool loop: bounded by move count AND token spend (whichever first),
        // so a long multi-file task runs to completion but a runaway turn
        // can't burn the budget. See AGENT_LIMITS in agent-config.ts.
        for (let hop = 0; hop < AGENT_LIMITS.maxHops; hop++) {
          if (tokensUsed >= AGENT_LIMITS.maxTurnTokens) break;
          const calls = (resp.output ?? []).filter(
            (o): o is Extract<typeof o, { type: "function_call" }> => o.type === "function_call",
          );
          if (calls.length === 0) break;

          const settled = await runToolCalls(
            calls,
            (c) => c.name,
            async (call) => {
              let result: unknown;
              try {
                const parsedArgs = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
                result = await withGitAuth(gitAuth, () => executeTool(call.name, parsedArgs, ctx));
              } catch (e) {
                result = { error: e instanceof Error ? e.message : "tool failed" };
              }
              return { call, result };
            },
          );
          const outputs: { type: "function_call_output"; call_id: string; output: string }[] = [];
          for (const { call, result } of settled) {
            actions.push({ tool: call.name, label: toolLabel(call.name, result) });
            mergeChanges(changes, result);
            outputs.push({
              type: "function_call_output" as const,
              call_id: call.call_id,
              output: JSON.stringify(result).slice(0, toolResultCapFor(call.name)),
            });
          }

          resp = await streamOrCreate({
            model: aiModel || OPENAI_MODEL,
            previous_response_id: resp.id,
            input: outputs,
            tools: workspaceTools(mode),
            store: true,
          });
          tokensUsed += resp.usage?.total_tokens ?? 0;

          for (const item of resp.output ?? []) {
            if (item.type === "web_search_call") actions.push({ tool: "web_search", label: toolLabel("web_search", null) });
          }
        }

        text = resp.output_text?.trim() || "";

        // Reasoning models can exhaust the tool-loop budget with no message
        // text. Force a wrap-up turn (tools disabled) so the user always gets
        // a real answer about what happened.
        if (!text) {
          try {
            const wrap = await streamOrCreate({
              model: aiModel || OPENAI_MODEL,
              previous_response_id: resp.id,
              input: [
                {
                  role: "user" as const,
                  content:
                    mode === "plan"
                      ? "Stop exploring and reply now with the numbered implementation plan you arrived at. Do not call tools."
                      : "Stop working and reply now: in 1-3 sentences, what did you change in the workspace and what (if anything) is still unfinished? Do not call tools.",
                },
              ],
              tools: workspaceTools(mode),
              tool_choice: "none",
              store: true,
            });
            tokensUsed += wrap.usage?.total_tokens ?? 0;
            text = wrap.output_text?.trim() || "";
          } catch {
            // fall through to the action-based fallback
          }
        }
        if (!text) {
          const labels = Array.from(new Set(actions.map((a) => a.label)));
          text = labels.length
            ? `All set! I ${labels.join(", ")}. Open the preview to see it.`
            : "All set!";
        }
      } catch (e) {
        console.error("[helix-chat]", e);
        // Surface actionable provider errors instead of a generic failure.
        const status = (e as { status?: number }).status;
        if (status === 401) {
          return {
            error:
              "OpenAI rejected the API key. Set a valid OPENAI_API_KEY on the server, or paste your own key in Settings → AI model.",
          };
        }
        if (status === 429) {
          const code = (e as { code?: string }).code;
          return {
            error:
              code === "insufficient_quota"
                ? "Your OpenAI account is out of credits — add billing at platform.openai.com/settings/organization/billing, or switch provider / paste a different key in Settings → AI model."
                : "OpenAI rate limit hit — wait a moment and try again.",
          };
        }
        return { error: "Something went wrong while talking to the model. Try again." };
      }
    }

    // Guardrail: some models print the write_files payload into the reply
    // instead of calling the tool. Detect, execute for real, and clean the
    // text. NEVER in plan mode — plan turns must not write anything.
    if (mode !== "plan") {
      try {
        text = await salvageInlineFileWrites(text, ctx, changes);
      } catch (e) {
        console.error("[helix-chat] salvage failed", e);
      }
    }

    // If the provider didn't report usage, estimate (~4 chars per token) so
    // guest metering can't be bypassed by a provider that omits usage. Counts
    // the whole input (system + every message), not just the latest turn.
    if (tokensUsed === 0) {
      const msgChars = messages.reduce((n, m) => n + m.content.length, 0);
      tokensUsed = estimateTokens(instructions.length + msgChars + text.length);
    }

    // Mark plan turns so the chat UI can render the approve card (live via
    // the final stream event and after a history reload).
    if (mode === "plan") {
      actions.push({ tool: "plan", label: "proposed a plan" });
    }

    // Verify phase: run the freshly-built project in the sandbox, read errors,
    // and (best-effort) fix + re-run. Default ON (VERIFY_DEFAULT_ON) for build
    // turns that wrote files — the caller can still force it off (e.g. nested
    // fix turns pass verify:false to stop recursion). Gated to non-guests and
    // an available runner; always degrades to a skip — never fails the turn.
    const verifyWanted = opts.verify ?? VERIFY_DEFAULT_ON;
    let verify: TurnResult["verify"];
    if (
      verifyWanted &&
      mode === "build" &&
      changes.written.length > 0 &&
      !dbUser?.isGuest &&
      (usingSandboxBackend() || runnerEnabled())
    ) {
      const result = await verifyBuild({
        ws,
        treePaths,
        pkgJson,
        changes,
        actions,
        emit,
        maxAttempts: opts.verifyMaxAttempts ?? VERIFY_MAX_FIX_ATTEMPTS,
        // Injected fix runner — a build-mode turn with verify OFF (the guard
        // that prevents infinite verify recursion). Not persisted; its changes
        // and tokens fold into this turn.
        runFix: async (fixMessage) => {
          const r = await runAgentTurn({
            ws,
            userId,
            message: fixMessage,
            onEvent,
            persist: false,
            mode: "build",
            verify: false,
            intentId: intentId ?? undefined,
          });
          if ("error" in r) return null;
          return { changes: r.changes, actions: r.actions, tokensUsed: r.tokensUsed };
        },
      });
      tokensUsed += result.extraTokens;
      const marker = verifyMarker(result);
      actions.push({ tool: marker.tool, label: marker.label, ...(marker.log ? { log: marker.log } : {}) });
      verify = { status: result.status, command: result.command, log: result.log };
    }

    // Finalize the ledger intent this call created (fix turns inherit theirs
    // and leave finalizing to the parent). Best-effort, like persist below.
    if (createdIntentId) {
      try {
        await db().workspaceIntent.update({
          where: { id: createdIntentId },
          data: { status: "final", reasoning: text.slice(0, 8000) },
        });
      } catch (e) {
        console.error("[ledger] intent finalize failed", e);
      }
    }

    // Persist the turn (best-effort — the reply still goes out if this fails).
    if (persist) {
      try {
        await db().$transaction([
          db().workspaceMessage.create({
            data: { workspaceId: ws.id, role: "user", content: userMessage },
          }),
          db().workspaceMessage.create({
            data: { workspaceId: ws.id, role: "assistant", content: text, actions },
          }),
          ...aiUsageOps({
            userId,
            tokens: tokensUsed,
            kind: "chat",
            provider: aiProvider,
            // aiModel is "" when the OpenAI default applies — record the real one.
            model: aiModel || (aiProvider === "openai" ? OPENAI_MODEL : ""),
            workspaceId: ws.id,
          }),
        ]);
      } catch (e) {
        console.error("[helix-chat] persist failed", e);
      }
    }

    // The client meter reflects the effective guest cap (an admin-set
    // tokenLimit overrides the default allowance).
    const guestRemaining = dbUser?.isGuest
      ? Math.max(0, (dbUser.tokenLimit ?? GUEST_TOKEN_LIMIT) - (dbUser.tokensUsed + tokensUsed))
      : null;

    return { text, actions, changes, tokensUsed, guestRemaining, verify };
  } finally {
    clearProgress(ws.id);
  }
}
