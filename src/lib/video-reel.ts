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
            "You are a cinematic director shaping ONE cohesive short film from a single idea — NOT a set of " +
            "unrelated clips. The clips will be generated independently and stitched, so continuity must be " +
            "forced through the prompts. " +
            "FIRST commit to one fixed visual identity for the WHOLE film and put it in `style`: a specific " +
            "colour palette/grade, film stock & grain, lighting, lens/camera language, the world/setting, and " +
            "the recurring main subject(s) described with a FIXED, repeatable appearance (face, hair, wardrobe, " +
            "colours). " +
            "THEN write the shot list. Every shot is ONE continuous take of at most 20 seconds that depicts the " +
            "SAME world and the SAME subject (identical look) in that SAME style. " +
            "Treat the whole film as ONE UNBROKEN sequence: each shot must pick up exactly where the previous one " +
            "left off — continue the action, hold the same camera direction, or cut on motion — progressing a " +
            "single continuous timeline (location, time of day, weather). NEVER reset to an unrelated scene or " +
            "teleport the subject; consecutive shots should connect like a seamless tracking move or a clean " +
            "match cut. " +
            "Each shot prompt: subject + action + camera move + lighting + mood — concise, do NOT restate the " +
            "global style (it is added automatically). Return STRICT JSON only.",
        },
        {
          role: "user",
          content:
            `Idea: ${idea}\n\n` +
            `Return JSON with exactly ${n} scenes: ` +
            `{"style":"one vivid sentence describing the fixed look, recurring subject and world shared by EVERY shot",` +
            `"scenes":[{"title":"short label","prompt":"this shot's subject, action, camera and mood"}]}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: { style?: unknown; scenes?: { title?: unknown; prompt?: unknown }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "Couldn't plan the shots — try a more descriptive idea." };
    }
    // The shared anchor — prepended to EVERY shot prompt so the clips carry one
    // consistent look/subject/world even though Sora renders each in isolation.
    const style = typeof parsed.style === "string" ? parsed.style.trim() : "";
    const scenes: ReelScene[] = (parsed.scenes ?? [])
      .filter((s) => typeof s?.prompt === "string" && (s.prompt as string).trim().length > 0)
      .slice(0, n)
      .map((s, i) => {
        const shot = (s.prompt as string).trim();
        const full = style ? `${style} ${shot}` : shot;
        return {
          title: typeof s.title === "string" && s.title.trim() ? s.title.trim() : `Shot ${i + 1}`,
          prompt: full.slice(0, 2000),
        };
      });

    if (scenes.length === 0) return { error: "Couldn't plan the shots — try a more descriptive idea." };
    return scenes;
  } catch (e) {
    return { error: brandProviderError(e instanceof Error ? e.message : undefined) };
  }
}
