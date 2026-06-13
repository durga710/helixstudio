/**
 * /api/billing/portal — POST: the signed-in user opens the Stripe Billing
 * Portal for their own tier subscription (change plan, payment method,
 * cancel). Returns { url }. Mirrors the per-Space portal route.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { userBillingEnabled, getStripe } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard("billing.portal", { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  if (!userBillingEnabled()) return apiErrors.badRequest("Plan upgrades aren't configured on this deployment.");

  const user = await db().user.findUnique({
    where: { id: g.user.id },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) return apiErrors.badRequest("No billing history yet — upgrade first.");

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || new URL(req.url).origin;
  const session = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/settings`,
  });
  return ok({ url: session.url });
}
