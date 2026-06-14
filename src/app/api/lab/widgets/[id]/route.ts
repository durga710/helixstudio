/**
 * A teacher's saved widget instance.
 *   PATCH  → update { title?, config? }.
 *   DELETE → remove it.
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

const PatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard("lab.widget.edit", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  const { id } = await params;

  const row = await db().labWidget.findUnique({ where: { id }, select: { authorId: true } });
  if (!row || row.authorId !== g.user.id) return apiErrors.notFound("Widget");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  await db().labWidget.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title.trim() }),
      ...(parsed.data.config !== undefined && { config: parsed.data.config as object }),
    },
  });
  return ok({ saved: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const g = await guard("lab.widget.delete", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  const { id } = await params;

  const row = await db().labWidget.findUnique({ where: { id }, select: { authorId: true } });
  if (!row || row.authorId !== g.user.id) return apiErrors.notFound("Widget");

  await db().labWidget.delete({ where: { id } });
  return ok({ deleted: true });
}
