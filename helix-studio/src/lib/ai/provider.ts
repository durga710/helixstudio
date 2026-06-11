import Anthropic from "@anthropic-ai/sdk";
import { mockCompletion } from "./mock";

/* Model routing: the Settings screen exposes three tiers + a reasoning depth.
 * With ANTHROPIC_API_KEY set, requests stream from the Claude API; without it
 * Helix degrades to a deterministic mock provider so the product runs anywhere. */

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
  tier: ModelTier;
  depth: ReasoningDepth;
}

export function aiProviderName(): "anthropic" | "mock" {
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
}

export async function* streamCompletion(req: ChatRequest): AsyncGenerator<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    yield* mockCompletion(req);
    return;
  }

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL_IDS[req.tier],
    max_tokens: 64000,
    system: req.system,
    // Adaptive thinking for Deep mode on Sonnet/Opus; Haiku and Fast mode run without it.
    ...(req.depth === "deep" && req.tier !== "haiku" ? { thinking: { type: "adaptive" as const } } : {}),
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

export const HELIX_SYSTEM_PROMPT = `You are Helix, the AI engineer inside Helix Studio.
Work plan-first: before proposing code, give a short implementation plan as a checklist.
Keep responses tight and production-focused. Reference files with inline code formatting.
After any code change, note what the Reviewer, Security, and Performance agents should check.`;
