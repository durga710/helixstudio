/**
 * /api/admin/users/[id] — PATCH: the admin override surface for one user.
 *
 *   { tier?: "free"|"pro"|"team",      // manual tier (Stripe still wins for
 *                                      // users with a live subscription)
 *     tokenLimit?: number | null,      // absolute monthly cap; 0 = AI off;
 *                                      // null clears back to the tier default
 *     suspended?: boolean,             // true blocks ALL API use within one
 *                                      // request; false reinstates
 *     resetTokens?: boolean }          // zero both counters (lifetime+month);
 *                                      // AiUsageEvent history is kept
 *
 * Admin-gated (404 to everyone else). Self-suspension is refused so the last
 * admin can't lock themselves out.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guardAdmin } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Schema = z
  .object({
    tier: z.enum(["free", "pro", "team"]).optional(),
    tokenLimit: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    suspended: z.boolean().optional(),
    resetTokens: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: "Nothing to change" });

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured (demo mode).");

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const body = parsed.data;

  const target = await db().user.findUnique({
    where: { id },
    select: { id: true, email: true, suspendedAt: true },
  });
  if (!target) return apiErrors.notFound("User");

  if (body.suspended === true && target.id === g.admin.id) {
    return apiErrors.badRequest("You can't suspend your own account.");
  }

  const updated = await db().user.update({
    where: { id },
    data: {
      ...(body.tier !== undefined ? { tier: body.tier } : {}),
      ...(body.tokenLimit !== undefined ? { tokenLimit: body.tokenLimit } : {}),
      ...(body.suspended !== undefined ? { suspendedAt: body.suspended ? new Date() : null } : {}),
      ...(body.resetTokens ? { tokensUsed: 0, periodTokens: 0 } : {}),
    },
    select: { id: true, tier: true, tokenLimit: true, tokensUsed: true, periodTokens: true, suspendedAt: true },
  });

  // Console audit trail (no app-level admin audit table yet).
  console.log(`[admin] ${g.admin.email} patched user ${target.email ?? target.id}:`, JSON.stringify(body));

  return ok(updated);
}
