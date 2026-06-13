/**
 * /api/spaces/[id]/billing/portal — POST: owner opens the Stripe Billing
 * Portal (manage seats, payment method, cancel). Returns { url }.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { billingEnabled, getStripe } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("billing.portal", { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  if (!billingEnabled()) return apiErrors.badRequest("Billing isn't configured on this deployment.");

  const space = await db().space.findUnique({
    where: { id },
    select: { id: true, ownerId: true, stripeCustomerId: true },
  });
  if (!space || space.ownerId !== g.user.id) return apiErrors.notFound("Space");
  if (!space.stripeCustomerId) return apiErrors.badRequest("This space has no billing history yet.");

  const origin =
    process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || new URL(req.url).origin;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: space.stripeCustomerId,
      return_url: `${origin}/space?s=${space.id}`,
    });
    return ok({ url: session.url });
  } catch {
    return apiErrors.badRequest("Couldn't open the billing portal — it may not be set up in Stripe yet.");
  }
}
