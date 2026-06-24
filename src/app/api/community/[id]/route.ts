/**
 * /api/community/[id]
 *   GET    → post detail (increments viewCount, debounced per viewer)
 *   DELETE → unpublish (author only)
 */

import { guard } from "@/lib/route-helpers";
import { ok, apiErrors } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { getPostDetail, recordView, unpublish } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("community.detail", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const post = await getPostDetail(id, g.user.id);
  if (!post) return apiErrors.notFound("Post");

  // Count one view per viewer per 30s (a refresh loop can't inflate it).
  const rl = await rateLimit(`community.view:${id}:${g.user.id}`, { limit: 1, windowMs: 30_000 });
  if (rl.success) void recordView(id);

  return ok(post);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("community.unpublish", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const result = await unpublish(g.user.id, id);
  if ("error" in result) return apiErrors.notFound("Post");
  return ok(result);
}
