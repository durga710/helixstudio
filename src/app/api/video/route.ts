/**
 * HelixVideo API — premium text-to-video.
 *   POST /api/video         → start a job  { prompt, seconds, size } → { id, status }
 *   GET  /api/video?id=…     → poll status  → { id, status, progress }
 * The MP4 itself streams from /api/video/[id]/content.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";
import { createVideo, videoStatus } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CreateSchema = z.object({
  prompt: z.string().min(3).max(2_000),
  seconds: z.enum(["4", "8", "12", "16", "20"]).default("4"),
  size: z.enum(["720x1280", "1280x720", "1024x1792", "1792x1024"]).default("1280x720"),
});

export async function POST(req: Request) {
  // Tight rate limit — video is expensive (premium-only, gated in the lib too).
  const g = await guard("video.create", { limit: 20, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.validation(new z.ZodError([]));
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result = await createVideo(g.user.id, g.user.email ?? null, parsed.data);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}

export async function GET(req: Request) {
  const g = await guard("video.status", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiErrors.badRequest("id is required");
  const result = await videoStatus(g.user.id, g.user.email ?? null, id);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}
