/**
 * POST /api/templates/classify — given a from-scratch project prompt, return
 * the best starter template + alternatives for the confirm UI. Cheapest-first
 * (keyword rules; one tiny model call only when ambiguous). See router.ts.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";
import { classifyPrompt } from "@/lib/templates/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ prompt: z.string().trim().min(1).max(2000) });

export async function POST(req: Request) {
  const g = await guard("templates.classify", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result = await classifyPrompt(parsed.data.prompt, g.user.id);
  return ok(result);
}
