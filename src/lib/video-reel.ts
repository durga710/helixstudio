import "server-only";

/**
 * HelixReel planning — turn one idea into a shot list for long-form video.
 *
 * Sora caps a single clip at 20s, so minutes-long video is built from N short
 * shots stitched in order (see HelixReel.tsx). This splits the user's idea into
 * a coherent, flowing shot list; the client then generates one Sora clip per
 * shot and previews them stitched. Reuses the SAME premium gate + house key as
 * HelixVideo (houseClient) so there's one place that owns video access.
 */

import { houseClient } from "@/lib/video";
import { brandProviderError } from "@/lib/ai/provider-errors";

/** A planned shot: a title for the UI + a cinematic prompt for Sora. */
export interface ReelScene {
  title: string;
  prompt: string;
}

/** Helix model behind the planner (white-labeled; never shown to users). */
const PLANNER_MODEL = "gpt-5.4-mini";

/** The most shots one reel can plan — bounds cost (each shot is a Sora clip). */
export const MAX_REEL_SCENES = 15;

/**
 * Plan `sceneCount` shots from `idea`. Returns the shot list or a branded error
 * (no raw provider/billing text). Each shot is meant to be a single continuous
 * take of <=20 seconds that flows into the next.
 */
export async function planReel(
  userId: string,
  email: string | null,
  idea: string,
  sceneCount: number,
): Promise<ReelScene[] | { error: string }> {
  const client = await houseClient(userId, email);
  if ("error" in client) return { error: client.error };

  const n = Math.max(2, Math.min(MAX_REEL_SCENES, Math.round(sceneCount)));
  try {
    const resp = await client.chat.completions.create({
      model: PLANNER_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a cinematic director. Break an idea into a numbered shot list for a short film. " +
            "Each shot is ONE continuous camera take of at most 20 seconds — vivid, self-contained, and " +
            "flowing into the next for visual continuity (consistent subject, style, lighting, palette). " +
            "Write each prompt as a rich text-to-video prompt (subject, action, camera move, mood, lighting). " +
            "Return STRICT JSON only.",
        },
        {
          role: "user",
          content:
            `Idea: ${idea}\n\n` +
            `Return JSON of exactly ${n} shots: ` +
            `{"scenes":[{"title":"short label","prompt":"detailed cinematic shot prompt"}]}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: { scenes?: { title?: unknown; prompt?: unknown }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "Couldn't plan the shots — try a more descriptive idea." };
    }
    const scenes: ReelScene[] = (parsed.scenes ?? [])
      .filter((s) => typeof s?.prompt === "string" && (s.prompt as string).trim().length > 0)
      .slice(0, n)
      .map((s, i) => ({
        title: typeof s.title === "string" && s.title.trim() ? s.title.trim() : `Shot ${i + 1}`,
        prompt: (s.prompt as string).trim().slice(0, 2000),
      }));

    if (scenes.length === 0) return { error: "Couldn't plan the shots — try a more descriptive idea." };
    return scenes;
  } catch (e) {
    return { error: brandProviderError(e instanceof Error ? e.message : undefined) };
  }
}
