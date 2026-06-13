import "server-only";

/**
 * Multi-provider agent runners for the GCODE workspace chat.
 *
 * The default OpenAI path (Responses API, with built-in web_search) lives in
 * the chat route. These runners cover the other providers:
 *   - anthropic: Claude via the Messages API (function tools, multi-hop)
 *   - local:     any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM…)
 *
 * All providers execute the same WORKSPACE_TOOLS through executeTool(), so
 * the agent has identical hands regardless of which brain is driving.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  workspaceTools,
  executeTool,
  toolLabel,
  mergeChanges,
  type ChangeManifest,
  type ToolContext,
} from "@/lib/workspace-tools";
import { AGENT_LIMITS, ANTHROPIC_MAX_OUTPUT, READONLY_TOOLS, toolResultCapFor } from "@/lib/agent-config";
import { withRetry } from "@/lib/ai/retry";
import { resolveAiKey, GEMINI_BASE_URL, PROVIDER_DEFAULT_MODEL } from "@/lib/ai/keys";
import { isAdminEmail } from "@/lib/admin";

// Re-exported so existing importers (agent-turn, webhook, ai-review) keep their
// `from "@/lib/ai-agent"` import — the canonical definition lives in ai/keys.ts.
export { PROVIDER_DEFAULT_MODEL } from "@/lib/ai/keys";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AgentResult {
  text: string;
  actions: { tool: string; label: string }[];
  changes: ChangeManifest;
  /** Total provider-reported tokens for the turn (guest metering). */
  tokensUsed: number;
}

const MAX_HOPS = AGENT_LIMITS.maxHops;

/** True once a turn has spent its token budget — stop calling tools, wrap up. */
function outOfBudget(tokensUsed: number): boolean {
  return tokensUsed >= AGENT_LIMITS.maxTurnTokens;
}

type FunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

function functionTools(mode: "plan" | "build" = "build"): FunctionTool[] {
  return (workspaceTools(mode) as ReadonlyArray<Record<string, unknown>>)
    .filter((t) => t.type === "function")
    .map((t) => ({
      type: "function" as const,
      name: String(t.name),
      description: String(t.description),
      parameters: t.parameters as Record<string, unknown>,
    }));
}

/**
 * Execute a hop's tool calls. When every call is read-only there are no
 * mutations to order, so run them in parallel (big latency win on exploration
 * hops); otherwise run sequentially to keep write/run ordering deterministic.
 * Results come back in call order either way.
 */
export async function runToolCalls<C>(
  calls: C[],
  nameOf: (c: C) => string,
  exec: (c: C) => Promise<{ call: C; result: unknown }>,
): Promise<{ call: C; result: unknown }[]> {
  if (calls.every((c) => READONLY_TOOLS.has(nameOf(c)))) return Promise.all(calls.map(exec));
  const out: { call: C; result: unknown }[] = [];
  for (const c of calls) out.push(await exec(c));
  return out;
}

/* ============================ Anthropic ============================ */

export async function runAnthropicAgent(opts: {
  model: string;
  instructions: string;
  messages: AgentMessage[];
  ctx: ToolContext;
  apiKey?: string;
  /** Live token deltas of the assistant's reply (streaming). */
  onText?: (delta: string) => void;
}): Promise<AgentResult | { error: string }> {
  const apiKey = opts.apiKey;
  if (!apiKey) return { error: "Anthropic is not configured — add your API key in Settings → AI model." };

  // The SDK handles SSE parsing + tool-use reconstruction (.finalMessage) and
  // transient-error retries (maxRetries), so the runner stays simple.
  const client = new Anthropic({ apiKey, maxRetries: 2 });

  const tools: Anthropic.Tool[] = functionTools(opts.ctx.mode).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
  // Prompt caching: the tools block and the large, stable system prompt are
  // identical on every hop of a turn (and across turns until the workspace
  // changes), so mark them cacheable. Anthropic serves the prefix from cache —
  // ~90% cheaper input tokens and noticeably lower latency on multi-hop tasks.
  if (tools.length) tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } };
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: opts.instructions, cache_control: { type: "ephemeral" } },
  ];

  const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));

  const actions: AgentResult["actions"] = [];
  const changes: ChangeManifest = { written: [], deleted: [] };
  let tokensUsed = 0;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let msg: Anthropic.Message;
    try {
      const stream = client.messages.stream({
        model: opts.model,
        max_tokens: ANTHROPIC_MAX_OUTPUT,
        system,
        messages,
        tools,
      });
      stream.on("text", (delta) => opts.onText?.(delta));
      msg = await stream.finalMessage();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Anthropic request failed" };
    }

    tokensUsed += (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);
    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (msg.stop_reason !== "tool_use" || toolUses.length === 0 || hop === MAX_HOPS || outOfBudget(tokensUsed)) {
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: text || "(no reply)", actions, changes, tokensUsed };
    }

    messages.push({ role: "assistant", content: msg.content });

    const settled = await runToolCalls(
      toolUses,
      (c) => c.name,
      async (call) => {
        let result: unknown;
        try {
          result = await executeTool(call.name, (call.input ?? {}) as Record<string, unknown>, opts.ctx);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
        return { call, result };
      },
    );
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const { call, result } of settled) {
      actions.push({ tool: call.name, label: toolLabel(call.name, result) });
      mergeChanges(changes, result);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(result).slice(0, toolResultCapFor(call.name ?? "")),
      });
    }
    messages.push({ role: "user", content: results });
  }

  return { error: "agent loop did not terminate" };
}

/* ====================== Local (OpenAI-compatible) ====================== */

export async function runLocalAgent(opts: {
  model: string;
  baseUrl: string;
  instructions: string;
  messages: AgentMessage[];
  ctx: ToolContext;
  apiKey?: string;
  /** What to call the endpoint in error messages (e.g. "Gemini"). */
  label?: string;
}): Promise<AgentResult | { error: string }> {
  const label = opts.label ?? "the local model";
  // Many local/custom endpoints need no auth; cloud OpenAI-compatible ones
  // (e.g. Gemini) get their key resolved upstream and passed in here.
  const client = new OpenAI({ apiKey: opts.apiKey || "not-needed", baseURL: opts.baseUrl });

  const tools = functionTools(opts.ctx.mode).map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.instructions },
    ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions: AgentResult["actions"] = [];
  const changes: ChangeManifest = { written: [], deleted: [] };
  let tokensUsed = 0;

  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const resp = await withRetry(() => client.chat.completions.create({ model: opts.model, messages, tools }));
      tokensUsed += resp.usage?.total_tokens ?? 0;
      const msg = resp.choices[0]?.message;
      if (!msg) return { error: "empty response from the local model" };

      const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
      if (calls.length === 0 || hop === MAX_HOPS || outOfBudget(tokensUsed)) {
        return { text: (msg.content ?? "").trim() || "(no reply)", actions, changes, tokensUsed };
      }

      messages.push(msg);
      const settled = await runToolCalls(
        calls,
        (c) => c.function.name,
        async (call) => {
          let result: unknown;
          try {
            const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
            result = await executeTool(call.function.name, args, opts.ctx);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : "tool failed" };
          }
          return { call, result };
        },
      );
      for (const { call, result } of settled) {
        actions.push({ tool: call.function.name, label: toolLabel(call.function.name, result) });
        mergeChanges(changes, result);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, toolResultCapFor(call.function.name)),
        });
      }
    }
    return { error: "agent loop did not terminate" };
  } catch (e) {
    return {
      error: `Couldn't reach ${label} at ${opts.baseUrl} — ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}. The URL must be reachable from the server (a tunnel, not localhost on your laptop).`,
    };
  }
}

/* ====================== One-shot completions ======================= */

/** The per-provider preference field holding the user's own key. */
function userKeyFor(provider: string, prefs: { openaiKey?: string | null; anthropicKey?: string | null; localKey?: string | null; geminiKey?: string | null } | null): string | undefined {
  switch (provider) {
    case "openai":
      return prefs?.openaiKey ?? undefined;
    case "anthropic":
      return prefs?.anthropicKey ?? undefined;
    case "gemini":
      return prefs?.geminiKey ?? undefined;
    case "local":
      return prefs?.localKey ?? undefined;
    default:
      return undefined;
  }
}

/**
 * The user's chat AI preferences, resolved the same way for every one-shot
 * caller (review, ledger ask, undo untangle). Key resolution goes through
 * resolveAiKey: the user's OWN key always works; the platform (env) key
 * resolves ONLY for admins — so a fresh signup can never spend our keys.
 */
export async function resolveAiPrefs(userId: string): Promise<{
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl: string;
}> {
  const { db } = await import("@/lib/db");
  const { OPENAI_MODEL } = await import("@/lib/openai");
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
  const provider = prefs?.aiProvider ?? "openai";
  const prefModel = prefs?.aiModel === "default" ? "" : (prefs?.aiModel ?? "");
  const model = prefModel || PROVIDER_DEFAULT_MODEL[provider] || OPENAI_MODEL;
  const apiKey = resolveAiKey({
    provider,
    userKey: userKeyFor(provider, prefs),
    isAdmin: isAdminEmail(prefs?.user?.email),
  });
  const baseUrl =
    provider === "gemini" ? GEMINI_BASE_URL : prefs?.aiBaseUrl || "http://localhost:1234/v1";
  return { provider, model, apiKey, baseUrl };
}

/**
 * One model call, no tools. Provider/model/key resolution is the caller's
 * job (resolveAiPrefs reuses the user's chat preferences).
 */
export async function runOneShot(opts: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  system: string;
  user: string;
  /** Anthropic output budget (its API requires one). Default 2048. */
  maxTokens?: number;
}): Promise<{ text: string; tokensUsed: number } | { error: string }> {
  try {
    if (opts.provider === "anthropic") {
      const apiKey = opts.apiKey;
      if (!apiKey) return { error: "No Anthropic API key — add one in Settings → AI model." };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens ?? 2048,
          system: opts.system,
          messages: [{ role: "user", content: opts.user }],
        }),
        cache: "no-store",
      });
      if (!res.ok) return { error: `Anthropic error ${res.status}` };
      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (data.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      return {
        text,
        tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      };
    }

    // openai, gemini, and local all speak the OpenAI-compatible chat surface.
    // Gemini has a fixed base URL; local is a user-supplied endpoint.
    const baseURL = opts.provider === "gemini" ? GEMINI_BASE_URL : opts.provider === "local" ? opts.baseUrl : undefined;
    const client = new OpenAI({ baseURL, apiKey: opts.apiKey || "not-needed" });
    if (opts.provider !== "local" && !opts.apiKey) {
      const label = opts.provider === "gemini" ? "Gemini" : "OpenAI";
      return { error: `No ${label} API key — add one in Settings → AI model.` };
    }
    const resp = await client.chat.completions.create({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    });
    return {
      text: resp.choices[0]?.message?.content?.trim() || "",
      tokensUsed: resp.usage?.total_tokens ?? 0,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "model call failed" };
  }
}

/* ============================ Reviewer ============================= */

/**
 * One model call, no tools: review a pending diff. Used by the
 * "Review changes" action — provider/model/key resolution is the caller's
 * job (it reuses the user's chat preferences).
 */
export async function runReviewer(opts: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  diffText: string;
  /** Override the default code-review framing (e.g. assignment grading). */
  system?: string;
}): Promise<{ text: string; tokensUsed: number } | { error: string }> {
  const system =
    opts.system ??
    "You are a senior code reviewer. Review the pending workspace changes below. " +
      "Flag ONLY real problems — correctness bugs, security issues, data loss, broken builds — with file and line " +
      "references. Skip style nits. Be concise (bullets). End with exactly one line: 'Verdict: ship it' or " +
      "'Verdict: hold — <one-line reason>'.";
  const result = await runOneShot({
    provider: opts.provider,
    model: opts.model,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    system,
    user: `PENDING CHANGES:\n\n${opts.diffText}`,
  });
  if ("error" in result) return result;
  return { text: result.text || "(no review produced)", tokensUsed: result.tokensUsed };
}
