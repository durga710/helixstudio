/** /api/community/[id]/fork — POST: fork an app post into a new workspace for
 * the caller. Returns the new workspace id (the client routes to the editor). */

import { guard } from "@/lib/route-helpers";
import { ok, apiErrors } from "@/lib/api-response";
import { forkPost } from "@/lib/community";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("community.fork", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const result = await forkPost(g.user.id, id);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}
