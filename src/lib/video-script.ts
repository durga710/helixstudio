import "server-only";

/**
 * HelixVideo Script Assistant — a tiny, guided prompt-builder. The user gives a
 * rough idea; the model asks AT MOST 3 concrete questions (subject, style,
 * setting, camera, pacing), then synthesizes one vivid text-to-video prompt the
 * user can drop straight into the composer. Two small chat calls total.
 *
 * ENGINE: Gunner Max (Bedrock GPT-OSS 120B) is the default for every premium
 * user — it runs on the platform Bedrock key (no per-clip OpenAI cost, works
 * without OpenAI credits). Premium-gated like the rest of HelixVideo (so a free
 * user never reaches the model). Falls back to the house OpenAI model only if
 * Bedrock isn't wired. Mirrors the new-project intake engine (intake.ts).
 */

import OpenAI from "openai";
import { isPremiumUser } from "@/lib/templates/select";
import { resolveBedrockModel } from "@/lib/ai/bedrock";
import { houseClient } from "@/lib/video";
import { recordAiUsage } from "@/lib/ai-usage";

/** Gunner Max = GPT-OSS 120B on Bedrock — the default assistant engine. */
const GUNNER_MAX = "openai.gpt-oss-120b-1:0";
/** Only used if Bedrock isn't configured (keeps the feature working). */
const FALLBACK_MODEL = "gpt-4o-mini";

export interface ScriptQuestion {
  key: string;
  text: string;
  /** Quick-reply chips; absent → free-text answer. */
  options?: string[];
}

export type ScriptResult =
  | { done: false; questions: ScriptQuestion[] }
  | { done: true; script: string }
  | { error: string };

interface Engine {
  client: OpenAI;
  model: string;
  provider: string;
}

/**
 * Resolve the assistant engine for a PREMIUM user: Gunner Max via the platform
 * Bedrock key by default; the house OpenAI client only as a fallback. Returns an
 * error (surfaced as a clean 400) for non-premium users or when nothing's wired.
 */
async function assistantEngine(userId: string, email: string | null): Promise<Engine | { error: string }> {
  if (!(await isPremiumUser(userId, email))) {
    return { error: "HelixVideo is a premium feature — upgrade your plan to use the script assistant." };
  }
  // Default for all premium users: Gunner Max (Bedrock GPT-OSS 120B).
  const b = resolveBedrockModel(GUNNER_MAX);
  if (b) {
    return {
      client: new OpenAI({ apiKey: b.apiKey, baseURL: b.baseUrl, defaultHeaders: b.headers }),
      model: b.modelId,
      provider: "bedrock",
    };
  }
  // Fallback — Bedrock not configured: use the house OpenAI client (re-checks premium, harmless).
  const house = await houseClient(userId, email);
  if ("error" in house) return { error: house.error };
  return { client: house, model: FALLBACK_MODEL, provider: "openai" };
}

export async function scriptAssistant(opts: {
  userId: string;
  email: string | null;
  idea: string;
  answers?: Record<string, string>;
}): Promise<ScriptResult> {
  const engine = await assistantEngine(opts.userId, opts.email);
  if ("error" in engine) return { error: engine.error };
  const { client, model, provider } = engine;
  const idea = opts.idea.trim().slice(0, 1500);
  const meter = (tokens: number) =>
    void recordAiUsage({ userId: opts.userId, tokens, kind: "video_script", provider, model });

  // Round 2 — synthesize the final prompt from the idea + answers.
  if (opts.answers && Object.keys(opts.answers).length > 0) {
    try {
      const ans = Object.entries(opts.answers)
        .filter(([, v]) => v?.trim() && v.trim().toLowerCase() !== "skip")
        .map(([k, v]) => `${k}: ${v.trim()}`)
        .join("\n");
      const res = await client.chat.completions.create({
        model,
        temperature: 0.8,
        max_tokens: 320,
        messages: [
          {
            role: "system",
            content:
              "You write prompts for a text-to-video model. From the idea and the user's answers, write ONE vivid, " +
              "cinematic prompt (1–4 sentences) with a concrete subject, setting, lighting, camera angle/motion, and mood. " +
              "No preamble, no quotes, no markdown — output ONLY the prompt text.",
          },
          { role: "user", content: `Idea: ${idea}\n${ans}` },
        ],
      });
      meter(res.usage?.total_tokens ?? 0);
      const script = res.choices[0]?.message?.content?.trim();
      if (!script) return { error: "Couldn't draft a script. Try writing your own." };
      return { done: true, script: script.replace(/^["']|["']$/g, "").slice(0, 2000) };
    } catch {
      return { error: "Couldn't draft a script right now — try writing your own." };
    }
  }

  // Round 1 — ask a few concrete questions to fill the visual gaps.
  try {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.5,
      max_tokens: 320,
      messages: [
        {
          role: "system",
          content:
            "You help a user describe a short video for a text-to-video model. Ask AT MOST 3 short, concrete questions " +
            "to nail the visual (subject, style/mood, setting, camera motion, pacing). Prefer 2–4 quick-reply options each. " +
            'Return ONLY minified JSON: {"questions":[{"key":"slug","text":"...","options":["..."]}]}. options is optional. ' +
            "No prose, no code fences.",
        },
        { role: "user", content: `Idea: ${idea || "(not given yet — ask the most useful opening questions)"}` },
      ],
    });
    meter(res.usage?.total_tokens ?? 0);
    const raw = (res.choices[0]?.message?.content ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(raw) as { questions?: ScriptQuestion[] };
    const questions = (parsed.questions ?? [])
      .filter((q) => q && typeof q.text === "string" && typeof q.key === "string")
      .slice(0, 3)
      .map((q) => ({ key: q.key, text: q.text, options: Array.isArray(q.options) ? q.options.slice(0, 4) : undefined }));
    if (questions.length === 0) return { error: "Couldn't get suggestions. Try writing your own." };
    return { done: false, questions };
  } catch {
    return { error: "Couldn't get suggestions right now — try writing your own." };
  }
}
