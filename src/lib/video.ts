import "server-only";

/**
 * HelixVideo — white-labeled text-to-video on the house OpenAI key (Sora 2 Pro
 * under the hood; users only ever see "HelixVideo"). Premium-gated: video is
 * expensive, so only paid subscribers (pro/team) + admins can generate.
 *
 * Flow: createVideo() kicks off a job → the client polls videoStatus() until it
 * completes → videoContent() streams the MP4. Recording is best-effort usage
 * metering (kind: "video").
 */

import OpenAI from "openai";
import { isPremiumUser } from "@/lib/templates/select";
import { recordAiUsage } from "@/lib/ai-usage";

/** The model behind HelixVideo (never shown to users). */
const HELIX_VIDEO_MODEL = "sora-2-pro";

export type HelixVideoSeconds = "4" | "8" | "12";
export type HelixVideoSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";

export const HELIX_VIDEO_SECONDS: HelixVideoSeconds[] = ["4", "8", "12"];
export const HELIX_VIDEO_SIZES: { value: HelixVideoSize; label: string }[] = [
  { value: "1280x720", label: "Landscape · 720p" },
  { value: "720x1280", label: "Portrait · 720p" },
  { value: "1792x1024", label: "Landscape · HD" },
  { value: "1024x1792", label: "Portrait · HD" },
];

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress: number;
  /** Named `failReason` (not `error`) so it never collides with the `{ error }`
   *  error-return shape — that keeps `"error" in result` a clean discriminant. */
  failReason?: string;
}

/** Resolve a house OpenAI client for video — premium only. */
async function houseClient(
  userId: string,
  email: string | null,
): Promise<OpenAI | { error: string; code: "forbidden" | "config" }> {
  const premium = await isPremiumUser(userId, email);
  if (!premium) {
    return { error: "HelixVideo is a premium feature — upgrade your plan to create videos.", code: "forbidden" };
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { error: "Video generation isn't configured.", code: "config" };
  return new OpenAI({ apiKey: key });
}

/** Start a video generation job. Returns the job, or an error. */
export async function createVideo(
  userId: string,
  email: string | null,
  opts: { prompt: string; seconds: HelixVideoSeconds; size: HelixVideoSize },
): Promise<VideoJob | { error: string }> {
  const client = await houseClient(userId, email);
  if ("error" in client) return { error: client.error };
  try {
    const v = await client.videos.create({
      model: HELIX_VIDEO_MODEL,
      prompt: opts.prompt,
      seconds: opts.seconds,
      size: opts.size,
    });
    // Best-effort usage marker (video is billed by clip, not tokens; record 0).
    void recordAiUsage({ userId, tokens: 0, kind: "video", provider: "helixvideo", model: HELIX_VIDEO_MODEL });
    return { id: v.id, status: v.status, progress: v.progress };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "couldn't start the video" };
  }
}

/** Poll a job's status. */
export async function videoStatus(
  userId: string,
  email: string | null,
  id: string,
): Promise<VideoJob | { error: string }> {
  const client = await houseClient(userId, email);
  if ("error" in client) return { error: client.error };
  try {
    const v = await client.videos.retrieve(id);
    return { id: v.id, status: v.status, progress: v.progress, failReason: v.error?.message ?? undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "couldn't read the video status" };
  }
}

/** Fetch the finished MP4 as a web Response (streamable to the client). */
export async function videoContent(
  userId: string,
  email: string | null,
  id: string,
): Promise<Response | { error: string }> {
  const client = await houseClient(userId, email);
  if ("error" in client) return { error: client.error };
  try {
    return await client.videos.downloadContent(id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "couldn't download the video" };
  }
}
