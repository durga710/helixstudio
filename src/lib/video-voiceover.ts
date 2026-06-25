import "server-only";

/**
 * HelixVoice — single-narrator AI voiceover for HelixVideo reels. Generates an
 * MP3 from a script via OpenAI TTS (gpt-4o-mini-tts), reusing the SAME premium
 * gate + house key as video generation (houseClient in src/lib/video.ts). The
 * client muxes the returned audio onto the exported reel (src/lib/reel-export).
 */

import { houseClient } from "@/lib/video";
import { db, dbEnabled } from "@/lib/db";

/** Curated narrator voices (a subset of the provider's set, white-labeled). */
export const VOICEOVER_VOICES = [
  { id: "alloy", label: "Alloy", note: "Neutral, clear" },
  { id: "nova", label: "Nova", note: "Warm, friendly" },
  { id: "shimmer", label: "Shimmer", note: "Bright, upbeat" },
  { id: "onyx", label: "Onyx", note: "Deep, authoritative" },
  { id: "fable", label: "Fable", note: "Expressive storyteller" },
  { id: "echo", label: "Echo", note: "Calm, measured" },
] as const;

export type VoiceoverVoiceId = (typeof VOICEOVER_VOICES)[number]["id"];

const TTS_MODEL = "gpt-4o-mini-tts";
const SCRIPT_MAX = 4000;
const DEFAULT_VOICE: VoiceoverVoiceId = "alloy";

function isValidVoice(v: string): v is VoiceoverVoiceId {
  return VOICEOVER_VOICES.some((x) => x.id === v);
}

/** Best-effort usage row so voiceover shows up in usage history (no enforcement
 * — TTS is cheap, and the premium gate already governs access). */
async function recordVoiceoverUsage(userId: string, chars: number): Promise<void> {
  if (!dbEnabled()) return;
  try {
    await db().aiUsageEvent.create({
      data: {
        userId,
        kind: "video_voiceover",
        provider: "helixvoice",
        model: TTS_MODEL,
        tokens: Math.ceil(chars / 4),
      },
    });
  } catch (e) {
    console.error("[helixvoice] usage record failed", e);
  }
}

/** Generate a single-narrator voiceover (MP3 bytes) from a script. Premium-gated
 * via the shared HelixVideo house client. */
export async function generateVoiceover(
  userId: string,
  email: string | null,
  opts: { script: string; voice: string },
): Promise<{ audio: Buffer } | { error: string; code?: "forbidden" | "config" }> {
  const script = (opts.script ?? "").trim().slice(0, SCRIPT_MAX);
  if (!script) return { error: "Write a short script for the voiceover." };
  const voice: VoiceoverVoiceId = isValidVoice(opts.voice) ? opts.voice : DEFAULT_VOICE;

  const client = await houseClient(userId, email);
  if ("error" in client) return { error: client.error, code: client.code };

  try {
    const res = await client.audio.speech.create({
      model: TTS_MODEL,
      voice,
      input: script,
      response_format: "mp3",
    });
    const audio = Buffer.from(await res.arrayBuffer());
    void recordVoiceoverUsage(userId, script.length);
    return { audio };
  } catch (e) {
    console.error("[helixvoice] tts failed", e);
    return { error: "Couldn't generate the voiceover. Please try again." };
  }
}
