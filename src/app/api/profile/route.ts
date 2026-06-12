/**
 * /api/profile — PATCH: update your own profile (avatar + display name).
 * The avatar is a small data-URL produced by the client (resized to ~128px),
 * stored directly on User.image. Self-only: the guard's session user is the
 * only row touched.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const PatchSchema = z.object({
  // A small data-URL avatar, or null to clear. 100k chars (~75KB) is a backstop;
  // the client keeps it ~10KB.
  image: z.string().max(100_000).nullable().optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

export async function GET() {
  const g = await guard("profile", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  // The session image can lag the DB by up to 60s (JWT revalidation window), so
  // the Settings UI reads the live value here to always show the true avatar.
  const u = await db().user.findUnique({ where: { id: g.user.id }, select: { name: true, image: true } });
  return ok({ name: u?.name ?? null, image: u?.image ?? null });
}

export async function PATCH(req: Request) {
  const g = await guard("profile", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const data: { image?: string | null; name?: string } = {};
  if (parsed.data.image !== undefined) {
    if (parsed.data.image === null) {
      data.image = null;
    } else if (DATA_URL.test(parsed.data.image)) {
      data.image = parsed.data.image;
    } else {
      return apiErrors.badRequest("Picture must be a PNG, JPEG, or WebP image.");
    }
  }
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (Object.keys(data).length === 0) return apiErrors.badRequest("Nothing to update.");

  const updated = await db().user.update({
    where: { id: g.user.id },
    data,
    select: { name: true, image: true },
  });
  return ok({ saved: true, name: updated.name, image: updated.image });
}
