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
 * Resolve the assistant engines for a PREMIUM user, in PREFERENCE ORDER:
 * Gunner Max (Bedrock GPT-OSS 120B) first when wired, then the house OpenAI
 * client. Returning a LIST (not one engine) is the fix for "the script assistant
 * doesn't work": the previous version committed to Bedrock and errored when the
 * Bedrock *call* failed (broken/misconfigured) instead of falling back to the
 * working OpenAI key. Errors for non-premium users or when nothing is wired.
 */
async function assistantEngines(userId: string, email: string | null): Promise<Engine[] | { error: string }> {
  if (!(await isPremiumUser(userId, email))) {
    return { error: "HelixVideo is a premium feature — upgrade your plan to use the script assistant." };
  }
  const engines: Engine[] = [];
  // Preferred: Gunner Max (Bedrock GPT-OSS 120B) — no per-call OpenAI cost.
  const b = resolveBedrockModel(GUNNER_MAX);
  if (b) {
    engines.push({
      client: new OpenAI({ apiKey: b.apiKey, baseURL: b.baseUrl, defaultHeaders: b.headers }),
      model: b.modelId,
      provider: "bedrock",
    });
  }
  // Always include the house OpenAI client as a reliable fallback when wired.
  const house = await houseClient(userId, email);
  if (!("error" in house)) {
    engines.push({ client: house, model: FALLBACK_MODEL, provider: "openai" });
  }
  if (engines.length === 0) {
    return { error: "The script assistant isn't available right now — write your own prompt." };
  }
  return engines;
}

/**
 * Run a chat completion across the engines in order, falling back to the next on
 * ANY error and metering whichever one actually answered. Throws only if every
 * engine fails — so the feature works as long as Bedrock OR OpenAI is healthy.
 */
async function completeWithFallback(
  engines: Engine[],
  userId: string,
  params: { temperature: number; max_tokens: number; messages: OpenAI.Chat.ChatCompletionMessageParam[] },
): Promise<string> {
  let lastErr: unknown;
  for (const e of engines) {
    try {
      const res = await e.client.chat.completions.create({ model: e.model, ...params });
      void recordAiUsage({ userId, tokens: res.usage?.total_tokens ?? 0, kind: "video_script", provider: e.provider, model: e.model });
      return res.choices[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("all engines failed");
}

export async function scriptAssistant(opts: {
  userId: string;
  email: string | null;
  idea: string;
  answers?: Record<string, string>;
}): Promise<ScriptResult> {
  const engines = await assistantEngines(opts.userId, opts.email);
  if ("error" in engines) return { error: engines.error };
  const idea = opts.idea.trim().slice(0, 1500);

  // Round 2 — synthesize the final prompt from the idea + answers.
  if (opts.answers && Object.keys(opts.answers).length > 0) {
    try {
      const ans = Object.entries(opts.answers)
        .filter(([, v]) => v?.trim() && v.trim().toLowerCase() !== "skip")
        .map(([k, v]) => `${k}: ${v.trim()}`)
        .join("\n");
      const content = await completeWithFallback(engines, opts.userId, {
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
      const script = content.trim();
      if (!script) return { error: "Couldn't draft a script. Try writing your own." };
      return { done: true, script: script.replace(/^["']|["']$/g, "").slice(0, 2000) };
    } catch {
      return { error: "Couldn't draft a script right now — try writing your own." };
    }
  }

  // Round 1 — ask a few concrete questions to fill the visual gaps.
  try {
    const content = await completeWithFallback(engines, opts.userId, {
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
    const raw = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
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
