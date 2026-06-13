import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/* Multi-provider model routing (ported from gcode's editor).
 *
 * Resolution order per request:
 *   1. The user's own key (BYOK cookie) for the chosen provider
 *   2. A platform key in the environment
 * With no key, we do NOT fabricate a response — we say so plainly and stop.
 *
 * Providers: Anthropic (Claude), OpenAI, and any OpenAI-compatible local
 * server (LM Studio / Ollama / vLLM) via GUEST_AI_BASE_URL. */

/** Honest no-key message — streamed instead of a fabricated answer. */
const NO_KEY_MESSAGE =
  "No AI provider key is configured. Add one in Settings → AI to start building with Helix.";

export type Provider = "anthropic" | "openai" | "local";
export type ModelTier = "haiku" | "sonnet" | "opus";
export type ReasoningDepth = "fast" | "deep";

export const MODEL_IDS: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  system?: string;
  provider?: Provider;
  tier: ModelTier;
  depth: ReasoningDepth;
  /** The user's own key for the active provider (BYOK). */
  apiKey?: string;
}

/** "live" when a key resolves for the provider, "none" when none is configured. */
export function aiProviderName(provider: Provider, userKey?: string): "live" | "none" {
  return resolveKey(provider, userKey) ? "live" : "none";
}

function resolveKey(provider: Provider, userKey?: string): string | undefined {
  if (userKey) return userKey;
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "local") return process.env.LOCAL_AI_API_KEY || "local";
  return process.env.ANTHROPIC_API_KEY;
}

async function* streamAnthropic(req: ChatRequest, apiKey: string): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: MODEL_IDS[req.tier],
    max_tokens: 64000,
    system: req.system,
    ...(req.depth === "deep" && req.tier !== "haiku" ? { thinking: { type: "adaptive" as const } } : {}),
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

async function* streamOpenAI(req: ChatRequest, apiKey: string): AsyncGenerator<string> {
  const baseURL = req.provider === "local" ? process.env.GUEST_AI_BASE_URL : undefined;
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const model =
    req.provider === "local"
      ? process.env.GUEST_AI_MODEL || "local-model"
      : process.env.OPENAI_MODEL || "gpt-4o-mini";
  const stream = await client.chat.completions.create({
    model,
    stream: true,
    messages: [
      ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function* streamCompletion(req: ChatRequest): AsyncGenerator<string> {
  const provider = req.provider ?? "anthropic";
  const apiKey = resolveKey(provider, req.apiKey);
  if (!apiKey) {
    yield NO_KEY_MESSAGE;
    return;
  }
  if (provider === "anthropic") {
    yield* streamAnthropic(req, apiKey);
  } else {
    yield* streamOpenAI(req, apiKey);
  }
}

export const HELIX_SYSTEM_PROMPT = `You are Helix, the AI engineer inside Helix Studio.
Work plan-first: before proposing code, give a short implementation plan as a checklist.
Keep responses tight and production-focused. Reference files with inline code formatting.
After any code change, note what the Reviewer, Security, and Performance agents should check.`;

/* System prompt for the editor's "apply changes" mode (gcode behavior): the
 * model returns file edits as fenced blocks the workspace applies live. */
export const EDIT_SYSTEM_PROMPT = `You are Helix, an AI pair programmer editing a real repository.
When you change code, output each file as a fenced block whose info string is the file path, e.g.:

\`\`\`path=src/app/page.tsx
<full new file contents>
\`\`\`

Always output the COMPLETE new contents of any file you modify or create, not a diff.
Give a one-line explanation before the blocks. Keep changes minimal and correct.`;
