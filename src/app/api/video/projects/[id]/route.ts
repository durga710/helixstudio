/** /api/video/projects/[id] — GET: load one of the caller's saved video
 *  projects (resume editing). Owner-scoped. */

import { guard } from "@/lib/route-helpers";
import { ok, apiErrors } from "@/lib/api-response";
import { schemaReady } from "@/lib/db";
import { loadVideoProject } from "@/lib/video-project";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("video.projects.load", { limit: 240, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  await schemaReady();

  const project = await loadVideoProject(id, g.user.id);
  if (!project) return apiErrors.notFound("Project");
  return ok({ project });
}
