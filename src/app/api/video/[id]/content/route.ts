/**
 * Streams a finished HelixVideo MP4 to the client (the player's src).
 * Premium-gated in the lib; proxied so the underlying provider URL is never
 * exposed to the browser.
 */

import { apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";
import { videoContent } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("video.content", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!id) return apiErrors.badRequest("id is required");

  const res = await videoContent(g.user.id, g.user.email ?? null, id);
  if (!(res instanceof Response)) return apiErrors.badRequest(res.error);

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") || "video/mp4",
      "Content-Disposition": `inline; filename="helixvideo-${id}.mp4"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
