/**
 * Admin-only live template preview. POST { templateId } → spins the stored
 * template up in a sandbox and returns a public URL to click-and-test it (it
 * self-expires in ~10 min). Needs the live Vercel env (OIDC).
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guardAdmin } from "@/lib/route-helpers";
import { previewTemplate } from "@/lib/templates/preview-sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Schema = z.object({ templateId: z.string().min(1).max(60) });

export async function POST(req: Request) {
  const g = await guardAdmin();
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const result = await previewTemplate(parsed.data.templateId);
  if ("error" in result) return apiErrors.badRequest(result.error);
  return ok(result);
}
