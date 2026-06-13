/**
 * /api/billing/plan — GET: the signed-in user's tier + token usage for the
 * Settings "Plan & usage" card. Never exposes other users' data; admin
 * overrides surface only as the effective limit.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { userBillingEnabled } from "@/lib/billing";
import { effectiveLimit } from "@/lib/token-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("billing.plan", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.notFound();

  const u = await db().user.findUnique({
    where: { id: g.user.id },
    select: {
      tier: true,
      isGuest: true,
      tokenLimit: true,
      tokensUsed: true,
      periodTokens: true,
      periodStart: true,
      stripeCustomerId: true,
      currentPeriodEnd: true,
    },
  });
  if (!u) return apiErrors.notFound("User");

  const limit = effectiveLimit(u);
  // Guests meter lifetime; members meter the current month.
  const used = u.isGuest ? u.tokensUsed : u.periodTokens;

  return ok({
    tier: u.isGuest ? "guest" : u.tier,
    used,
    limit, // null = unlimited
    periodStart: u.periodStart.toISOString(),
    upgradesEnabled: userBillingEnabled() && !u.isGuest,
    manageable: Boolean(u.stripeCustomerId),
    renewsAt: u.currentPeriodEnd?.toISOString() ?? null,
  });
}
