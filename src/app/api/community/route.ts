/**
 * /api/community — GET: the gallery list (search / type filter / sort / page).
 * Sign-in required (like the rest of the feature); returns lightweight card
 * DTOs only (never file contents), and annotates likedByViewer for the caller.
 */

import { guard } from "@/lib/route-helpers";
import { ok } from "@/lib/api-response";
import { listPosts } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("community.list", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const url = new URL(req.url);
  const page = Number.parseInt(url.searchParams.get("page") ?? "0", 10);
  const result = await listPosts({
    q: url.searchParams.get("q") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    page: Number.isFinite(page) ? page : 0,
    viewerId: g.user.id,
  });
  return ok(result);
}
