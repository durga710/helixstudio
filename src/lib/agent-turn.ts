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
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import {
  WORKSPACE_TOOLS,
  executeTool,
  toolLabel,
  mergeChanges,
  salvageInlineFileWrites,
  type ChangeManifest,
  type ToolContext,
} from "@/lib/workspace-tools";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import { setProgress, clearProgress } from "@/lib/progress";
import { runAnthropicAgent, runLocalAgent, PROVIDER_DEFAULT_MODEL } from "@/lib/ai-agent";
import {
  stackLine,
  treeOutline,
  historyContext,
  fitBudget,
  estimateTokens,
  INSTRUCTIONS_MAX,
} from "@/lib/chat-context";

// 40 rows feed the context engine: the newest 8 go verbatim, the rest
// become a one-line-per-turn digest (see src/lib/chat-context.ts).
const HISTORY_LIMIT = 40;

export interface TurnEvent {
  type: "activity";
  label: string;
}

export interface TurnResult {
  text: string;
  actions: { tool: string; label: string }[];
  changes: ChangeManifest;
  tokensUsed: number;
  guestRemaining: number | null;
}

export type TurnError = { error: string; code?: "GUEST_LIMIT" };

export async function runAgentTurn(opts: {
  ws: Workspace;
  userId: string;
  message: string;
  onEvent?: (e: TurnEvent) => void;
  /** Write user+assistant messages and meter tokens (default true). */
  persist?: boolean;
}): Promise<TurnResult | TurnError> {
  const { ws, userId, onEvent } = opts;
  const persist = opts.persist ?? true;
  const userMessage = opts.message.trim();
  const emit = (label: string) => onEvent?.({ type: "activity", label });

  // Guest metering: anonymous accounts get GUEST_TOKEN_LIMIT of AI usage,
  // then must sign in. Checked before any AI spend.
  const dbUser = await db().user.findUnique({
    where: { id: userId },
    select: { isGuest: true, tokensUsed: true },
  });
  if (dbUser?.isGuest && dbUser.tokensUsed >= GUEST_TOKEN_LIMIT) {
    return {
      code: "GUEST_LIMIT",
      error: `You've used your guest allowance (${GUEST_TOKEN_LIMIT.toLocaleString()} AI tokens). Sign in with GitHub or Google to keep building — it's free, and your work can push to your own repos.`,
    };
  }

  const prefs = await db().userPreferences.findUnique({
    where: { userId },
    select: {
      aiProvider: true,
      aiModel: true,
      aiBaseUrl: true,
      openaiKey: true,
      anthropicKey: true,
      localKey: true,
    },
  });
  let aiProvider = prefs?.aiProvider ?? "openai";
  // "default" was a broken literal an old picker saved — treat as unset.
  const prefModel = prefs?.aiModel === "default" ? "" : (prefs?.aiModel ?? "");
  let aiModel = prefModel || PROVIDER_DEFAULT_MODEL[aiProvider] || "";
  let aiBaseUrl = prefs?.aiBaseUrl || "http://localhost:1234/v1";
  // Per-provider keys: switching provider can never send the wrong vendor's key.
  let memberKey =
    (aiProvider === "openai"
      ? prefs?.openaiKey
      : aiProvider === "anthropic"
        ? prefs?.anthropicKey
        : prefs?.localKey) || undefined;

  // Guest beta model: when GUEST_AI_PROVIDER is set, ALL guests are pinned to
  // it (e.g. a local LM Studio model) so trial traffic never spends the
  // workspace's paid API keys. Signed-in users are unaffected.
  if (dbUser?.isGuest && process.env.GUEST_AI_PROVIDER) {
    aiProvider = process.env.GUEST_AI_PROVIDER;
    aiModel = process.env.GUEST_AI_MODEL || PROVIDER_DEFAULT_MODEL[aiProvider] || "";
    aiBaseUrl = process.env.GUEST_AI_BASE_URL || aiBaseUrl;
    memberKey = undefined;
  }

  const ai = aiProvider === "openai" ? (memberKey ? new OpenAI({ apiKey: memberKey }) : getOpenAI()) : null;
  if (aiProvider === "openai" && !ai) {
    return { error: "AI is not configured — add your API key in Settings, or set OPENAI_API_KEY on the server." };
  }

  const gitAuth = await getGitAuth(userId, ws.provider);

  // Context engine (src/lib/chat-context.ts): instead of resending the full
  // tree and 30 verbatim messages every turn, the model gets a stack line, a
  // collapsed tree outline, its own curated PROJECT NOTES, the repo's
  // AGENTS.md/CLAUDE.md, a digest of older turns, and a short verbatim
  // window — under a hard input budget.
  emit("reading the workspace…");
  const tree = await withGitAuth(gitAuth, () => listWorkspaceFiles(ws)).catch(() => []);
  const treePaths = tree.map((f) => f.path);
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
    select: { role: true, content: true, actions: true },
    take: HISTORY_LIMIT,
  });
  const { digest, recent } = historyContext(history.reverse());

  const rules =
    "You are Helix — an AI coding agent working in the user's virtual workspace. The workspace IS the project: " +
    "its file tree is outlined below, and your tools read and write it directly. The user watches the file tree and " +
    "editor update live as you work.\n\n" +
    "RULES:\n" +
    "- write_files is your ONLY way to produce code. Write COMPLETE file contents — never diffs, never snippets in chat, " +
    "never instructions for the user to create files themselves. You have hands; use them.\n" +
    '- NEVER print tool-call payloads, raw JSON like {"files":[...]}, or file contents in your chat reply. CALL the tool, ' +
    "then reply in plain language: what you added/changed and where (e.g. \"Added PROJECT_WORKFLOW.md — it's in the file explorer\").\n" +
    "- ALWAYS read_file before modifying an existing file so your rewrite keeps everything that should stay.\n" +
    "- Use search_files to find definitions/usages instead of guessing paths, and run_command to PROVE your work runs " +
    "(install, test, build) — if a command fails, fix the code and run it again.\n" +
    "- Match the project's existing stack and conventions. If PROJECT INSTRUCTIONS are present below, they are the " +
    "project owner's rules — follow them.\n" +
    "- For new projects pick a sensible stack: a single index.html with embedded CSS/JS for simple pages; Vite or " +
    "Next.js structure for real apps.\n" +
    "- Keep PROJECT NOTES current with the `remember` tool after meaningful decisions (stack choices, conventions, " +
    "gotchas) — it's your only durable memory; older conversation gets compressed.\n" +
    "- The user pushes to their git host from the UI — you cannot push, don't try, and don't tell them to run git commands.\n" +
    "- After building, reply in 2-4 lines: what you built/changed and any next step worth knowing. No tutorials.\n" +
    "- Ask at most ONE clarifying question, and only when the request is truly ambiguous — default to building.\n";

  const fitted = fitBudget({
    rules,
    workspaceMeta:
      `Name: ${ws.name}\n` +
      `Mode: ${ws.mode === "IMPORT" ? `imported from ${PROVIDER_META[getProvider(ws.provider).name].label} repo ${ws.repo} @ ${ws.baseBranch} (edits overlay the repo until pushed)` : "built from scratch (files live here until pushed to a git host)"}`,
    stack: stackLine(treePaths, pkgJson),
    tree: treeOutline(treePaths),
    notes: ws.notes ?? "",
    instructionsDoc,
    digest,
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
    (fitted.digest ? `\n\n--- EARLIER CONVERSATION (digest) ---\n${fitted.digest}` : "");

  const messages = [...fitted.recent, { role: "user" as const, content: userMessage }];

  if (process.env.NODE_ENV === "development") {
    const msgChars = messages.reduce((n, m) => n + m.content.length, 0);
    console.log(
      `[helix-chat] context: rules=${fitted.rules.length} tree=${fitted.tree.length} notes=${fitted.notes.length} ` +
        `agentsmd=${fitted.instructionsDoc.length} digest=${fitted.digest.length} recent=${fitted.recent.length}msg/${msgChars}ch ` +
        `≈${estimateTokens(instructions.length + msgChars)} input tokens`,
    );
  }

  // Prime the tool cache with the tree we already fetched — list_files inside
  // this turn reuses it instead of refetching (writes invalidate).
  const ctx: ToolContext = {
    userId,
    workspaceId: ws.id,
    cache: { tree },
    onActivity: (label) => emit(label),
  };
  setProgress(ws.id, "reading your message…");
  emit("thinking…");

  let text: string;
  let actions: { tool: string; label: string }[];
  let changes: ChangeManifest;
  let tokensUsed = 0;
  try {
    if (aiProvider === "anthropic" || aiProvider === "local") {
      const result = await withGitAuth(gitAuth, () =>
        aiProvider === "anthropic"
          ? runAnthropicAgent({ model: aiModel, instructions, messages, ctx, apiKey: memberKey })
          : runLocalAgent({ model: aiModel, baseUrl: aiBaseUrl, instructions, messages, ctx, apiKey: memberKey }),
      );
      if ("error" in result) return { error: result.error };
      ({ text, actions, changes, tokensUsed } = result);
    } else {
      // OpenAI Responses API with multi-hop function tools.
      actions = [];
      changes = { written: [], deleted: [] };
      try {
        let resp = await ai!.responses.create({
          model: aiModel || OPENAI_MODEL,
          instructions,
          input: messages,
          tools: WORKSPACE_TOOLS,
          store: true,
        });
        tokensUsed += resp.usage?.total_tokens ?? 0;

        for (const item of resp.output ?? []) {
          if (item.type === "web_search_call") actions.push({ tool: "web_search", label: toolLabel("web_search", null) });
        }

        for (let hop = 0; hop < 6; hop++) {
          const calls = (resp.output ?? []).filter(
            (o): o is Extract<typeof o, { type: "function_call" }> => o.type === "function_call",
          );
          if (calls.length === 0) break;

          const outputs = [];
          for (const call of calls) {
            let result: unknown;
            try {
              const parsedArgs = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
              result = await withGitAuth(gitAuth, () => executeTool(call.name, parsedArgs, ctx));
            } catch (e) {
              result = { error: e instanceof Error ? e.message : "tool failed" };
            }
            actions.push({ tool: call.name, label: toolLabel(call.name, result) });
            mergeChanges(changes, result);
            outputs.push({
              type: "function_call_output" as const,
              call_id: call.call_id,
              output: JSON.stringify(result).slice(0, 8000),
            });
          }

          resp = await ai!.responses.create({
            model: aiModel || OPENAI_MODEL,
            previous_response_id: resp.id,
            input: outputs,
            tools: WORKSPACE_TOOLS,
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
            const wrap = await ai!.responses.create({
              model: aiModel || OPENAI_MODEL,
              previous_response_id: resp.id,
              input: [
                {
                  role: "user" as const,
                  content:
                    "Stop working and reply now: in 1-3 sentences, what did you change in the workspace and what (if anything) is still unfinished? Do not call tools.",
                },
              ],
              tools: WORKSPACE_TOOLS,
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
          text = labels.length ? `Done — ${labels.join(", ")}.` : "Done.";
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
    // instead of calling the tool. Detect, execute for real, and clean the text.
    try {
      text = await salvageInlineFileWrites(text, ctx, changes);
    } catch (e) {
      console.error("[helix-chat] salvage failed", e);
    }

    // If the provider didn't report usage, estimate (~4 chars per token) so
    // guest metering can't be bypassed by a provider that omits usage. Counts
    // the whole input (system + every message), not just the latest turn.
    if (tokensUsed === 0) {
      const msgChars = messages.reduce((n, m) => n + m.content.length, 0);
      tokensUsed = estimateTokens(instructions.length + msgChars + text.length);
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
          db().user.update({
            where: { id: userId },
            data: { tokensUsed: { increment: tokensUsed } },
          }),
        ]);
      } catch (e) {
        console.error("[helix-chat] persist failed", e);
      }
    }

    const guestRemaining = dbUser?.isGuest
      ? Math.max(0, GUEST_TOKEN_LIMIT - (dbUser.tokensUsed + tokensUsed))
      : null;

    return { text, actions, changes, tokensUsed, guestRemaining };
  } finally {
    clearProgress(ws.id);
  }
}
