/**
 * Lesson catalog for the "assign a lesson" picker: the starter (bundled)
 * lessons + the teacher's own lessons for this classroom. Owner-of-space only.
 */

import { ok } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { getLessonManifests } from "@/lib/lessons/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("lab.catalog", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const spaceId = new URL(req.url).searchParams.get("spaceId");
  const bundled = getLessonManifests().map((m) => ({ id: m.id, title: m.title, group: "Starter lessons" }));

  let mine: { id: string; title: string; group: string }[] = [];
  if (spaceId && dbEnabled()) {
    const space = await db().space.findUnique({ where: { id: spaceId }, select: { ownerId: true } });
    if (space && space.ownerId === g.user.id) {
      const rows = await db().lesson.findMany({
        where: { authorId: g.user.id, spaceId },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
      });
      mine = rows.map((r) => ({ id: r.id, title: r.title, group: "Your lessons" }));
    }
  }

  return ok({ lessons: [...mine, ...bundled] });
}
