/**
 * /api/community/publish — POST: publish a project to the community.
 *   { kind: "app", workspaceId, title?, description? }  → app post (forkable)
 *   { kind: "video", embedUrl, title, description? }    → video post (embed)
 */

import { z } from "zod";
import { guard } from "@/lib/route-helpers";
import { ok, apiErrors } from "@/lib/api-response";
import { publishApp, publishVideo } from "@/lib/community";

export const runtime = "nodejs";

const Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("app"),
    workspaceId: z.string().min(1).max(64),
    title: z.string().max(120).optional(),
    description: z.string().max(2000).optional(),
  }),
  z.object({
    kind: z.literal("video"),
    embedUrl: z.string().min(1).max(500),
    title: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    videoProjectId: z.string().min(1).max(64).optional(),
    revealRecipe: z.boolean().optional(),
    allowRemix: z.boolean().optional(),
  }),
]);

export async function POST(req: Request) {
  const g = await guard("community.publish", { limit: 40, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result =
    parsed.data.kind === "app"
      ? await publishApp(g.user.id, parsed.data.workspaceId, parsed.data)
      : await publishVideo(g.user.id, parsed.data);

  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}
