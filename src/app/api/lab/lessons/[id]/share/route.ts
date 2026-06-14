/**
 * Share / unshare an authored lesson to the public teacher library.
 * Public → other teachers can browse it and clone it into their class.
 * Author-only.
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

const Schema = z.object({ public: z.boolean() });

export async function POST(req: Request, { params }: Params) {
  const g = await guard("lab.lesson.share", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  const { id } = await params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const row = await db().lesson.findUnique({ where: { id }, select: { authorId: true } });
  if (!row || row.authorId !== g.user.id) return apiErrors.notFound("Lesson");

  await db().lesson.update({
    where: { id },
    // Public lessons are also "published" so the library shows them; turning it
    // off returns the lesson to space-only visibility.
    data: parsed.data.public ? { visibility: "public", status: "published" } : { visibility: "space" },
  });
  return ok({ public: parsed.data.public });
}
