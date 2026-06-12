/** /api/workspaces/[id]/progress — GET: the AI's current live activity label. */

import { ok } from "@/lib/api-response";
import { getProgress } from "@/lib/progress";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("progress", id, { limit: 5000, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  return ok({ label: await getProgress(g.ws.id) });
}
