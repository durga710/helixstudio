/**
 * HelixVideo API — premium text-to-video.
 *   POST /api/video         → start a job  { prompt, seconds, size } → { id, status }
 *   GET  /api/video?id=…     → poll status  → { id, status, progress }
 * The MP4 itself streams from /api/video/[id]/content.
 */

import { z } from "zod";
import { toFile, type Uploadable } from "openai";
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

/** Largest reference image we'll forward (the client downscales to the video
 * size first, so this is just a safety ceiling). */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  // Tight rate limit — video is expensive (premium-only, gated in the lib too).
  const g = await guard("video.create", { limit: 20, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  // Two shapes: JSON (text-to-video) or multipart/form-data (with a reference
  // image for image-to-video). The composer/reel use JSON; the studio sends
  // multipart when a picture is attached.
  let data: unknown;
  let imageRef: Uploadable | undefined;
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiErrors.validation(new z.ZodError([]));
    }
    data = {
      prompt: form.get("prompt"),
      seconds: form.get("seconds") ?? undefined,
      size: form.get("size") ?? undefined,
    };
    const image = form.get("image");
    if (image && typeof image === "object" && "arrayBuffer" in image) {
      const file = image as File;
      if (file.size > MAX_IMAGE_BYTES) return apiErrors.badRequest("That image is too large.");
      if (file.size > 0) {
        const buf = Buffer.from(await file.arrayBuffer());
        imageRef = await toFile(buf, file.name || "reference.png", { type: file.type || "image/png" });
      }
    }
  } else {
    try {
      data = await req.json();
    } catch {
      return apiErrors.validation(new z.ZodError([]));
    }
  }

  const parsed = CreateSchema.safeParse(data);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result = await createVideo(g.user.id, g.user.email ?? null, { ...parsed.data, imageRef });
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
