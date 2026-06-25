/** /api/video/projects — POST: create or update the caller's saved video
 *  project (the long-form reel "editing space"). Returns { id }. */

import { z } from "zod";
import { guard } from "@/lib/route-helpers";
import { ok, apiErrors } from "@/lib/api-response";
import { schemaReady } from "@/lib/db";
import { saveVideoProject, listVideoProjects } from "@/lib/video-project";

export const runtime = "nodejs";

export async function GET() {
  const g = await guard("video.projects.list", { limit: 240, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  await schemaReady();
  const projects = await listVideoProjects(g.user.id);
  return ok({ projects });
}

const ShotSchema = z.object({
  title: z.string().max(200).optional(),
  prompt: z.string().max(4000).optional(),
  seconds: z.number().optional(),
});

const Schema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().max(120).optional(),
  idea: z.string().max(4000).optional(),
  transcript: z.string().max(20000).optional(),
  size: z.string().max(20).optional(),
  secondsEach: z.number().optional(),
  shots: z.array(ShotSchema).max(30).optional(),
});

export async function POST(req: Request) {
  const g = await guard("video.projects.save", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  await schemaReady();

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result = await saveVideoProject(g.user.id, parsed.data);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}
