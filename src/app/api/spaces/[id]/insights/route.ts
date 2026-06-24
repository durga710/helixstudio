/**
 * /api/spaces/[id]/insights — GET: per-member contribution insights.
 *
 * Visibility: any member of the Space.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { getSpaceInsights } from "@/lib/space-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("space.insights", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const member = await db().spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: id, userId: g.user.id } },
    select: { id: true },
  });
  if (!member) return apiErrors.notFound("Space");

  return ok(await getSpaceInsights(id));
}
