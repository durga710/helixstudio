/**
 * A teacher's saved widget library — configurable widget instances (a template +
 * a config blob filled with their own data) they can reuse across lessons.
 *   GET  ?spaceId=  → the teacher's saved widgets for that classroom.
 *   POST { spaceId, template, title, config } → save a new one.
 * Owner-of-the-space only; template must be a known widget id (no arbitrary code).
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { isWidgetId } from "@/lib/lessons/widgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  spaceId: z.string().min(1).max(60),
  template: z.string().min(1).max(60),
  title: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()),
});

async function ownsSpace(spaceId: string, userId: string): Promise<boolean> {
  const space = await db().space.findUnique({ where: { id: spaceId }, select: { ownerId: true } });
  return Boolean(space && space.ownerId === userId);
}

export async function GET(req: Request) {
  const g = await guard("lab.widgets.list", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return ok({ widgets: [] });

  const spaceId = new URL(req.url).searchParams.get("spaceId");
  if (!spaceId || !(await ownsSpace(spaceId, g.user.id))) return apiErrors.notFound("Classroom");

  const rows = await db().labWidget.findMany({
    where: { authorId: g.user.id, spaceId },
    select: { id: true, title: true, template: true, config: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return ok({ widgets: rows });
}

export async function POST(req: Request) {
  const g = await guard("lab.widgets.create", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { spaceId, template, title, config } = parsed.data;
  if (!(await ownsSpace(spaceId, g.user.id))) return apiErrors.notFound("Classroom");
  if (!isWidgetId(template)) return apiErrors.badRequest("Unknown widget.");

  const row = await db().labWidget.create({
    data: { authorId: g.user.id, spaceId, template, title: title.trim(), config: config as object },
    select: { id: true },
  });
  return ok({ id: row.id });
}
