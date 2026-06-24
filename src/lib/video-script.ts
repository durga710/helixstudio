import "server-only";

/**
 * HelixVideo Script Assistant — a tiny, guided prompt-builder. The user gives a
 * rough idea; the model asks AT MOST 3 concrete questions (subject, style,
 * setting, camera, pacing), then synthesizes one vivid text-to-video prompt the
 * user can drop straight into the composer. Two small chat calls total.
 *
 * Reuses HelixVideo's house OpenAI client + premium gate (houseClient in
 * video.ts) so a free user never reaches the model, and it needs no BYO key.
 * Mirrors the new-project intake engine's ask→synthesize shape (intake.ts).
 */

import { houseClient } from "@/lib/video";
import { recordAiUsage } from "@/lib/ai-usage";

/** Cheap text model for the assistant (the video model is separate). */
const SCRIPT_MODEL = "gpt-4o-mini";

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

export async function scriptAssistant(opts: {
  userId: string;
  email: string | null;
  idea: string;
  answers?: Record<string, string>;
}): Promise<ScriptResult> {
  const client = await houseClient(opts.userId, opts.email);
  if ("error" in client) return { error: client.error }; // premium / config gate
  const idea = opts.idea.trim().slice(0, 1500);

  // Round 2 — synthesize the final prompt from the idea + answers.
  if (opts.answers && Object.keys(opts.answers).length > 0) {
    try {
      const ans = Object.entries(opts.answers)
        .filter(([, v]) => v?.trim() && v.trim().toLowerCase() !== "skip")
        .map(([k, v]) => `${k}: ${v.trim()}`)
        .join("\n");
      const res = await client.chat.completions.create({
        model: SCRIPT_MODEL,
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
      void recordAiUsage({ userId: opts.userId, tokens: res.usage?.total_tokens ?? 0, kind: "video_script", provider: "openai", model: SCRIPT_MODEL });
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
      model: SCRIPT_MODEL,
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
    void recordAiUsage({ userId: opts.userId, tokens: res.usage?.total_tokens ?? 0, kind: "video_script", provider: "openai", model: SCRIPT_MODEL });
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
