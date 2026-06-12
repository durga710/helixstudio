/**
 * /api/workspaces/[id]/chat
 *   POST → one agent turn: { message }. The AI works on the workspace's
 *          virtual files via WORKSPACE_TOOLS; the response carries a change
 *          manifest { written[], deleted[] } so the editor updates live.
 *          Conversation history is persisted server-side (WorkspaceMessage).
 *
 * Non-streaming (an agent turn may run several tool round-trips).
 */

import { z } from "zod";
import OpenAI from "openai";
import { db } from "@/lib/db";
import { ok, err, apiErrors } from "@/lib/api-response";
import { getGitHubToken, GUEST_TOKEN_LIMIT } from "@/lib/auth";
import { withGitHubToken } from "@/lib/github";
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
import { listWorkspaceFiles } from "@/lib/workspace";
import { setProgress, clearProgress } from "@/lib/progress";
import { runAnthropicAgent, runLocalAgent, PROVIDER_DEFAULT_MODEL } from "@/lib/ai-agent";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;

const ChatSchema = z.object({
  message: z.string().min(1).max(8000),
});

const HISTORY_LIMIT = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("chat", id, { limit: 100, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const userMessage = parsed.data.message.trim();

  // Guest metering: anonymous accounts get GUEST_TOKEN_LIMIT of AI usage,
  // then must sign in. Checked before any AI spend.
  const dbUser = await db().user.findUnique({
    where: { id: user.id },
    select: { isGuest: true, tokensUsed: true },
  });
  if (dbUser?.isGuest && dbUser.tokensUsed >= GUEST_TOKEN_LIMIT) {
    return err(
      "GUEST_LIMIT",
      `You've used your guest allowance (${GUEST_TOKEN_LIMIT.toLocaleString()} AI tokens). Sign in with GitHub or Google to keep building — it's free, and your work can push to your own repos.`,
      403,
    );
  }

  const prefs = await db().userPreferences.findUnique({
    where: { userId: user.id },
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
    return apiErrors.badRequest(
      "AI is not configured — add your API key in Settings, or set OPENAI_API_KEY on the server.",
    );
  }

  const githubToken = await getGitHubToken(user.id);

  // Live file listing in the prompt so the model knows the tree without
  // burning a tool hop. Capped; IMPORT mode needs the GitHub token.
  const tree = await withGitHubToken(githubToken, () => listWorkspaceFiles(ws)).catch(() => []);
  const fileListing = tree
    .slice(0, 200)
    .map((f) => f.path)
    .join("\n");

  const instructions =
    "You are Helix — an AI coding agent working in the user's virtual workspace. The workspace IS the project: " +
    "its files are listed below, and your tools read and write them directly. The user watches the file tree and " +
    "editor update live as you work.\n\n" +
    "RULES:\n" +
    "- write_files is your ONLY way to produce code. Write COMPLETE file contents — never diffs, never snippets in chat, " +
    "never instructions for the user to create files themselves. You have hands; use them.\n" +
    '- NEVER print tool-call payloads, raw JSON like {"files":[...]}, or file contents in your chat reply. CALL the tool, ' +
    "then reply in plain language: what you added/changed and where (e.g. \"Added PROJECT_WORKFLOW.md — it's in the file explorer\").\n" +
    "- ALWAYS read_file before modifying an existing file so your rewrite keeps everything that should stay.\n" +
    "- Match the project's existing stack and conventions. For new projects pick a sensible stack: a single index.html " +
    "with embedded CSS/JS for simple pages; Vite or Next.js structure for real apps.\n" +
    "- The user pushes to GitHub from the UI — you cannot push, don't try, and don't tell them to run git commands.\n" +
    "- After building, reply in 2-4 lines: what you built/changed and any next step worth knowing. No tutorials.\n" +
    "- Ask at most ONE clarifying question, and only when the request is truly ambiguous — default to building.\n\n" +
    "--- WORKSPACE ---\n" +
    `Name: ${ws.name}\n` +
    `Mode: ${ws.mode === "IMPORT" ? `imported from GitHub repo ${ws.repo} @ ${ws.baseBranch} (edits overlay the repo until pushed)` : "built from scratch (files live here until pushed to GitHub)"}\n` +
    `Files (${tree.length}):\n${fileListing || "(empty — nothing written yet)"}`;

  // History: persisted messages + the new user turn.
  const history = await db().workspaceMessage.findMany({
    where: { workspaceId: ws.id },
    orderBy: { createdAt: "desc" },
    select: { role: true, content: true },
    take: HISTORY_LIMIT,
  });
  const messages = [
    ...history
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const ctx: ToolContext = { userId: user.id, workspaceId: ws.id };
  setProgress(ws.id, "reading your message…");

  let text: string;
  let actions: { tool: string; label: string }[];
  let changes: ChangeManifest;
  let tokensUsed = 0;
  try {

  if (aiProvider === "anthropic" || aiProvider === "local") {
    const result = await withGitHubToken(githubToken, () =>
      aiProvider === "anthropic"
        ? runAnthropicAgent({ model: aiModel, instructions, messages, ctx, apiKey: memberKey })
        : runLocalAgent({
            model: aiModel,
            baseUrl: aiBaseUrl,
            instructions,
            messages,
            ctx,
            apiKey: memberKey,
          }),
    );
    if ("error" in result) return apiErrors.badRequest(result.error);
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
            result = await withGitHubToken(githubToken, () => executeTool(call.name, parsedArgs, ctx));
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
      // Surface actionable provider errors instead of a generic 500.
      const status = (e as { status?: number }).status;
      if (status === 401) {
        return apiErrors.badRequest(
          "OpenAI rejected the API key. Set a valid OPENAI_API_KEY on the server, or paste your own key in Settings → AI model.",
        );
      }
      if (status === 429) {
        const code = (e as { code?: string }).code;
        return apiErrors.badRequest(
          code === "insufficient_quota"
            ? "Your OpenAI account is out of credits — add billing at platform.openai.com/settings/organization/billing, or switch provider / paste a different key in Settings → AI model."
            : "OpenAI rate limit hit — wait a moment and try again.",
        );
      }
      return apiErrors.internal();
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
  // guest metering can't be bypassed by a provider that omits usage.
  if (tokensUsed === 0) {
    tokensUsed = Math.ceil((instructions.length + userMessage.length + text.length) / 4);
  }

  // Persist the turn (best-effort — the reply still goes out if this fails).
  try {
    await db().$transaction([
      db().workspaceMessage.create({
        data: { workspaceId: ws.id, role: "user", content: userMessage },
      }),
      db().workspaceMessage.create({
        data: { workspaceId: ws.id, role: "assistant", content: text, actions },
      }),
      db().user.update({
        where: { id: user.id },
        data: { tokensUsed: { increment: tokensUsed } },
      }),
    ]);
  } catch (e) {
    console.error("[helix-chat] persist failed", e);
  }

  const guestRemaining = dbUser?.isGuest
    ? Math.max(0, GUEST_TOKEN_LIMIT - (dbUser.tokensUsed + tokensUsed))
    : null;

  return ok({ text, actions, changes, guestRemaining });
  } finally {
    clearProgress(ws.id);
  }
}
