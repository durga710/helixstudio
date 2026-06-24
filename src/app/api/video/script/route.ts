/**
 * /api/video/script — POST: the HelixVideo Script Assistant.
 *   { idea }           → { done:false, questions } (a few guided questions)
 *   { idea, answers }  → { done:true, script }     (the synthesized prompt)
 * Premium-gated in the service (reuses HelixVideo's house key).
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";
import { scriptAssistant } from "@/lib/video-script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Schema = z.object({
  idea: z.string().min(1).max(1500),
  answers: z.record(z.string(), z.string().max(400)).optional(),
});

export async function POST(req: Request) {
  const g = await guard("video.script", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result = await scriptAssistant({
    userId: g.user.id,
    email: g.user.email ?? null,
    idea: parsed.data.idea,
    answers: parsed.data.answers,
  });
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}
