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

/** POST to Anthropic Messages with transient-error retry (429/5xx/overloaded). */
async function anthropicMessages(apiKey: string, body: unknown): Promise<unknown> {
  return withRetry(async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw Object.assign(new Error(`Anthropic error ${res.status}: ${detail.slice(0, 300)}`), { status: res.status });
    }
    return res.json();
  });
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export async function runAnthropicAgent(opts: {
  model: string;
  instructions: string;
  messages: AgentMessage[];
  ctx: ToolContext;
  apiKey?: string;
}): Promise<AgentResult | { error: string }> {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return { error: "Anthropic is not configured — add your API key in Settings, or set ANTHROPIC_API_KEY." };

  type CacheControl = { type: "ephemeral" };
  type AnthropicTool = { name: string; description: string; input_schema: unknown; cache_control?: CacheControl };
  const tools: AnthropicTool[] = functionTools(opts.ctx.mode).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
  // Prompt caching: the tools block and the large, stable system prompt are
  // identical on every hop of a turn (and across turns until the workspace
  // changes), so mark them cacheable. Anthropic serves the prefix from cache —
  // ~90% cheaper input tokens and noticeably lower latency on multi-hop tasks.
  if (tools.length) tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } };
  const system = [{ type: "text" as const, text: opts.instructions, cache_control: { type: "ephemeral" as const } }];

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const actions: AgentResult["actions"] = [];
  const changes: ChangeManifest = { written: [], deleted: [] };
  let tokensUsed = 0;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let data: {
      content: AnthropicContentBlock[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    try {
      data = (await anthropicMessages(apiKey, {
        model: opts.model,
        max_tokens: ANTHROPIC_MAX_OUTPUT,
        system,
        messages,
        tools,
      })) as typeof data;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Anthropic request failed" };
    }

    tokensUsed += (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
    const toolUses = data.content.filter((b) => b.type === "tool_use");

    if (data.stop_reason !== "tool_use" || toolUses.length === 0 || hop === MAX_HOPS || outOfBudget(tokensUsed)) {
      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      return { text: text || "(no reply)", actions, changes, tokensUsed };
    }

    messages.push({ role: "assistant", content: data.content });

    const settled = await runToolCalls(
      toolUses,
      (c) => c.name ?? "",
      async (call) => {
        let result: unknown;
        try {
          result = await executeTool(call.name ?? "", call.input ?? {}, opts.ctx);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
        return { call, result };
      },
    );
    const results = [];
    for (const { call, result } of settled) {
      actions.push({ tool: call.name ?? "", label: toolLabel(call.name ?? "", result) });
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
}): Promise<AgentResult | { error: string }> {
  const client = new OpenAI({
    apiKey: opts.apiKey || process.env.LOCAL_AI_API_KEY || "not-needed",
    baseURL: opts.baseUrl,
  });

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
      error: `Couldn't reach the local model at ${opts.baseUrl} — ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}. The URL must be reachable from the server (a tunnel, not localhost on your laptop).`,
    };
  }
}

/** Default model per provider when the user hasn't picked one. */
export const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  openai: "", // falls through to OPENAI_MODEL
  anthropic: "claude-sonnet-4-6",
  local: "llama3.1",
};

/* ====================== One-shot completions ======================= */

/** The user's chat AI preferences, resolved the same way for every one-shot
 * caller (review, ledger ask, undo untangle). */
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
    select: { aiProvider: true, aiModel: true, aiBaseUrl: true, openaiKey: true, anthropicKey: true, localKey: true },
  });
  const provider = prefs?.aiProvider ?? "openai";
  const prefModel = prefs?.aiModel === "default" ? "" : (prefs?.aiModel ?? "");
  const model = prefModel || PROVIDER_DEFAULT_MODEL[provider] || OPENAI_MODEL;
  const apiKey =
    (provider === "openai" ? prefs?.openaiKey : provider === "anthropic" ? prefs?.anthropicKey : prefs?.localKey) ||
    undefined;
  return { provider, model, apiKey, baseUrl: prefs?.aiBaseUrl || "http://localhost:1234/v1" };
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
      const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
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

    // openai + local share the OpenAI-compatible chat surface.
    const client =
      opts.provider === "local"
        ? new OpenAI({ baseURL: opts.baseUrl, apiKey: opts.apiKey || "not-needed" })
        : new OpenAI({ apiKey: opts.apiKey || process.env.OPENAI_API_KEY });
    if (opts.provider !== "local" && !opts.apiKey && !process.env.OPENAI_API_KEY) {
      return { error: "No OpenAI API key — add one in Settings → AI model." };
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
