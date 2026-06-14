/**
 * Publish / unpublish an authored lesson to its classroom. Published → the
 * class's students see it in the AI Lab. Author-only.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const Schema = z.object({ publish: z.boolean() });

export async function POST(req: Request, { params }: Params) {
  const g = await guard("lab.lesson.publish", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  const { id } = await params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const row = await db().lesson.findUnique({ where: { id }, select: { authorId: true, spaceId: true } });
  if (!row || row.authorId !== g.user.id) return apiErrors.notFound("Lesson");
  if (parsed.data.publish && !row.spaceId) {
    return apiErrors.badRequest("This lesson isn't attached to a classroom.");
  }

  await db().lesson.update({
    where: { id },
    data: { status: parsed.data.publish ? "published" : "draft" },
  });
  return ok({ status: parsed.data.publish ? "published" : "draft" });
}
