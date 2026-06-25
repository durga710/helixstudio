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

import OpenAI, { type Uploadable } from "openai";
import { isPremiumUser } from "@/lib/templates/select";
import { db, dbEnabled } from "@/lib/db";
import { brandVideoMessage, sanitizeVideoError } from "@/lib/video-errors";

/** The model behind HelixVideo (never shown to users). */
const HELIX_VIDEO_MODEL = "sora-2-pro";

/**
 * SECURITY (H1): the provider video id is an opaque, guessable handle on a
 * SHARED house key — without an ownership record any premium user could poll or
 * download another user's video. We record ownership in AiUsageEvent (which also
 * gives video a usage-history row it previously lacked) and verify it before any
 * provider call. Ownership rows are pruned with usage history (~90d), which is
 * fine: provider video jobs expire well before then.
 */
async function recordVideoOwnership(userId: string, videoId: string): Promise<void> {
  if (!dbEnabled()) return;
  try {
    await db().aiUsageEvent.create({
      data: { userId, kind: "video", provider: "helixvideo", model: videoId, tokens: 0 },
    });
  } catch (e) {
    console.error("[helixvideo] ownership record failed", e);
  }
}

/** Whether this user created the given video id. Demo mode (no DB) is
 * single-tenant — the sole user owns everything. A DB error PROPAGATES: callers
 * must treat it as transient, never as "not owned" (that would lock the owner
 * out of their own render on a brief blip). */
async function ownsVideo(userId: string, videoId: string): Promise<boolean> {
  if (!dbEnabled()) return true;
  const row = await db().aiUsageEvent.findFirst({
    where: { userId, kind: "video", model: videoId },
    select: { id: true },
  });
  return !!row;
}

/** Ownership with transient-error tolerance: `true`/`false` for a definite
 * answer, or `null` when the check itself failed (DB blip) — callers surface a
 * RETRYABLE status for `null`, not a hard "not found". */
async function checkOwnership(userId: string, videoId: string): Promise<boolean | null> {
  try {
    return await ownsVideo(userId, videoId);
  } catch (e) {
    console.error("[helixvideo] ownership check failed", e);
    return null;
  }
}

export type HelixVideoSeconds = "4" | "8" | "12" | "16" | "20";
export type HelixVideoSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";

export const HELIX_VIDEO_SECONDS: HelixVideoSeconds[] = ["4", "8", "12", "16", "20"];
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

/** Resolve a house OpenAI client for video — premium only. Exported so the
 * Script Assistant (src/lib/video-script.ts) reuses the SAME premium gate +
 * house key instead of duplicating it. */
export async function houseClient(
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
  opts: {
    prompt: string;
    seconds: HelixVideoSeconds;
    size: HelixVideoSize;
    /** Optional reference image (image-to-video). Must already match `size` —
     * the client resizes it before upload so Sora never rejects a mismatch. */
    imageRef?: Uploadable;
  },
): Promise<VideoJob | { error: string }> {
  const client = await houseClient(userId, email);
  if ("error" in client) return { error: client.error };
  try {
    const v = await client.videos.create({
      model: HELIX_VIDEO_MODEL,
      prompt: opts.prompt,
      // The SDK's seconds union lags the API, which accepts "16"/"20" on
      // sora-2-pro (verified against the live endpoint). Cast so the wider
      // HelixVideoSeconds reaches the provider; the request is valid at runtime.
      seconds: opts.seconds as "4" | "8" | "12",
      size: opts.size,
      ...(opts.imageRef ? { input_reference: opts.imageRef } : {}),
    });
    // Record ownership BEFORE returning the id so a poll can't race ahead of it.
    await recordVideoOwnership(userId, v.id);
    return { id: v.id, status: v.status, progress: v.progress };
  } catch (e) {
    return { error: sanitizeVideoError(e, "Couldn't start the video. Please try again.") };
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
  const owns = await checkOwnership(userId, id);
  if (owns === null) return { error: "Couldn't read the video status." }; // transient — client retries
  if (!owns) return { error: "We couldn't find that video." };
  try {
    const v = await client.videos.retrieve(id);
    const failReason = v.error?.message
      ? brandVideoMessage(v.error.message, undefined, "The video couldn't be generated. Try a different prompt.")
      : undefined;
    return { id: v.id, status: v.status, progress: v.progress, failReason };
  } catch (e) {
    return { error: sanitizeVideoError(e, "Couldn't read the video status.") };
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
  const owns = await checkOwnership(userId, id);
  if (owns === null) return { error: "Couldn't read the video right now." }; // transient
  if (!owns) return { error: "We couldn't find that video." };
  try {
    return await client.videos.downloadContent(id);
  } catch (e) {
    return { error: sanitizeVideoError(e, "Couldn't download the video.") };
  }
}
