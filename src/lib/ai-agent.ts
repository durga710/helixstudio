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
  WORKSPACE_TOOLS,
  executeTool,
  toolLabel,
  mergeChanges,
  type ChangeManifest,
  type ToolContext,
} from "@/lib/workspace-tools";

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

const MAX_HOPS = 6;

type FunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

function functionTools(): FunctionTool[] {
  return (WORKSPACE_TOOLS as ReadonlyArray<Record<string, unknown>>)
    .filter((t) => t.type === "function")
    .map((t) => ({
      type: "function" as const,
      name: String(t.name),
      description: String(t.description),
      parameters: t.parameters as Record<string, unknown>,
    }));
}

/* ============================ Anthropic ============================ */

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

  const tools = functionTools().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const actions: AgentResult["actions"] = [];
  const changes: ChangeManifest = { written: [], deleted: [] };
  let tokensUsed = 0;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 8192,
        system: opts.instructions,
        messages,
        tools,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { error: `Anthropic error ${res.status}: ${detail.slice(0, 300)}` };
    }

    const data = (await res.json()) as {
      content: AnthropicContentBlock[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    tokensUsed += (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
    const toolUses = data.content.filter((b) => b.type === "tool_use");

    if (data.stop_reason !== "tool_use" || toolUses.length === 0 || hop === MAX_HOPS) {
      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      return { text: text || "(no reply)", actions, changes, tokensUsed };
    }

    messages.push({ role: "assistant", content: data.content });

    const results = [];
    for (const call of toolUses) {
      let result: unknown;
      try {
        result = await executeTool(call.name ?? "", call.input ?? {}, opts.ctx);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "tool failed" };
      }
      actions.push({ tool: call.name ?? "", label: toolLabel(call.name ?? "", result) });
      mergeChanges(changes, result);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
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

  const tools = functionTools().map((t) => ({
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
      const resp = await client.chat.completions.create({ model: opts.model, messages, tools });
      tokensUsed += resp.usage?.total_tokens ?? 0;
      const msg = resp.choices[0]?.message;
      if (!msg) return { error: "empty response from the local model" };

      const calls = msg.tool_calls ?? [];
      if (calls.length === 0 || hop === MAX_HOPS) {
        return { text: (msg.content ?? "").trim() || "(no reply)", actions, changes, tokensUsed };
      }

      messages.push(msg);
      for (const call of calls) {
        if (call.type !== "function") continue;
        let result: unknown;
        try {
          const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          result = await executeTool(call.function.name, args, opts.ctx);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
        actions.push({ tool: call.function.name, label: toolLabel(call.function.name, result) });
        mergeChanges(changes, result);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000),
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
