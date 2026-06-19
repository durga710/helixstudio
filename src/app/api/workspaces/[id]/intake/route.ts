/**
 * /api/workspaces/[id]/intake — POST: the new-project curation engine.
 *   Round 1: { idea } → { done, brief } | { done:false, questions }
 *   Round 2: { idea, answers } → { done:true, brief }
 *
 * Rules-first + a tiny, gated model call (see src/lib/intake.ts) — a clear
 * request spends zero tokens; a vague one gets at most one small B call.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guardWorkspace } from "@/lib/route-helpers";
import { curate } from "@/lib/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const Schema = z.object({
  // A long, detailed brief is exactly the kind of request we most want to
  // curate well — never reject it at the door (the engine reads/decomposes it).
  idea: z.string().min(1).max(20_000),
  answers: z.record(z.string(), z.string().max(500)).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("intake", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  try {
    const result = await curate({ idea: parsed.data.idea, userId: g.user.id, answers: parsed.data.answers });
    return ok(result);
  } catch {
    // Never block project creation on curation — let the client build directly.
    return ok({ done: true, brief: "", stack: "" });
  }
}
