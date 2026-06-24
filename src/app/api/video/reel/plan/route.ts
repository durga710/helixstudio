/**
 * HelixReel planning — POST an idea, get a shot list for long-form video.
 *   POST /api/video/reel/plan  { idea, scenes } → { scenes: [{ title, prompt }] }
 * The client then generates one HelixVideo clip per shot (the existing
 * /api/video flow) and previews them stitched (HelixReel).
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";
import { planReel, MAX_REEL_SCENES } from "@/lib/video-reel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({
  idea: z.string().min(3).max(2_000),
  scenes: z.number().int().min(2).max(MAX_REEL_SCENES).default(4),
});

export async function POST(req: Request) {
  // Planning is one model call — modest rate limit (generation is gated separately).
  const g = await guard("video.reel.plan", { limit: 40, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.validation(new z.ZodError([]));
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result = await planReel(g.user.id, g.user.email ?? null, parsed.data.idea, parsed.data.scenes);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok({ scenes: result });
}
