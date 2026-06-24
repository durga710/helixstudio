/** /api/community/[id]/like — POST: toggle the caller's like on a post. */

import { guard } from "@/lib/route-helpers";
import { ok, apiErrors } from "@/lib/api-response";
import { toggleLike } from "@/lib/community";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("community.like", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const result = await toggleLike(g.user.id, id);
  if ("error" in result) return apiErrors.notFound("Post");
  return ok(result);
}
