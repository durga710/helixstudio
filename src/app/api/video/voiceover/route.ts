/** /api/video/voiceover — POST: generate a single-narrator voiceover (MP3) from
 *  a script. Premium-gated (HelixVideo house key). Returns audio/mpeg bytes. */

import { z } from "zod";
import { guard } from "@/lib/route-helpers";
import { apiErrors } from "@/lib/api-response";
import { generateVoiceover } from "@/lib/video-voiceover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({
  script: z.string().min(1).max(4000),
  voice: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const g = await guard("video.voiceover", { limit: 40, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result = await generateVoiceover(g.user.id, g.user.email ?? null, {
    script: parsed.data.script,
    voice: parsed.data.voice ?? "alloy",
  });
  if ("error" in result) {
    return result.code === "forbidden"
      ? apiErrors.upgradeRequired(result.error)
      : apiErrors.badRequest(result.error);
  }
  return new Response(new Uint8Array(result.audio), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
