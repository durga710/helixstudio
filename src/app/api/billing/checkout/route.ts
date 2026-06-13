/**
 * /api/billing/checkout — POST { tier: "pro" | "team" }: the signed-in
 * user starts a Stripe Checkout session for their own tier subscription
 * (quantity 1). Returns { url } to redirect to. Mirrors the per-Space
 * checkout; the webhook tells them apart via metadata.userId.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { userBillingEnabled, getStripe, priceIdForTier } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ tier: z.enum(["pro", "team"]) });

function appOrigin(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || new URL(req.url).origin;
}

export async function POST(req: Request) {
  const g = await guard("billing.checkout", { limit: 20, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  if (!userBillingEnabled()) return apiErrors.badRequest("Plan upgrades aren't configured on this deployment.");

  const user = await db().user.findUnique({
    where: { id: g.user.id },
    select: { id: true, isGuest: true, stripeCustomerId: true },
  });
  if (!user) return apiErrors.notFound("User");
  if (user.isGuest) return apiErrors.badRequest("Sign in with GitHub or Google before upgrading — guest accounts can't subscribe.");

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);

  try {
    const stripe = getStripe();

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: g.user.email ?? undefined,
        name: g.user.name ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db().user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const origin = appOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceIdForTier(parsed.data.tier), quantity: 1 }],
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
      success_url: `${origin}/settings?billing=success`,
      cancel_url: `${origin}/settings`,
    });
    if (!session.url) return apiErrors.internal();
    return ok({ url: session.url });
  } catch {
    return apiErrors.badRequest("Couldn't start checkout — billing may not be fully configured yet.");
  }
}
