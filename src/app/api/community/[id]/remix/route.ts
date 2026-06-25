/** /api/community/[id]/remix — POST: fork a shared video's reel into a new
 *  VideoProject owned by the caller. Returns { projectId } (client opens the
 *  editor at /video/editor?project=<id>). */

import { guard } from "@/lib/route-helpers";
import { ok, apiErrors } from "@/lib/api-response";
import { schemaReady } from "@/lib/db";
import { remixVideoPost } from "@/lib/community";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("community.remix", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  await schemaReady();

  const result = await remixVideoPost(g.user.id, id);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}
