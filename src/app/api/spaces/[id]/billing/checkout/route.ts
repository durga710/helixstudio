/**
 * /api/spaces/[id]/billing/checkout — POST { seats }: owner starts a Stripe
 * Checkout session for this Space's subscription (quantity = seats; classroom
 * Spaces use the education price). Returns { url } to redirect to.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { billingEnabled, getStripe, priceIdForSpace } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({ seats: z.number().int().min(1).max(500) });

function appOrigin(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || new URL(req.url).origin;
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("billing.checkout", { limit: 20, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  if (!billingEnabled()) return apiErrors.badRequest("Billing isn't configured on this deployment.");

  const space = await db().space.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      kind: true,
      ownerId: true,
      stripeCustomerId: true,
      _count: { select: { members: true } },
    },
  });
  if (!space || space.ownerId !== g.user.id) return apiErrors.notFound("Space");

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  if (parsed.data.seats < space._count.members) {
    return apiErrors.badRequest(
      `This space already has ${space._count.members} members — buy at least that many seats.`,
    );
  }

  const stripe = getStripe();

  let customerId = space.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: g.user.email ?? undefined,
      name: g.user.name ?? undefined,
      metadata: { spaceId: space.id },
    });
    customerId = customer.id;
    await db().space.update({ where: { id: space.id }, data: { stripeCustomerId: customerId } });
  }

  const origin = appOrigin(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdForSpace(space), quantity: parsed.data.seats }],
    client_reference_id: space.id,
    subscription_data: { metadata: { spaceId: space.id } },
    success_url: `${origin}/space?s=${space.id}&billing=success`,
    cancel_url: `${origin}/space?s=${space.id}`,
  });
  if (!session.url) return apiErrors.internal();
  return ok({ url: session.url });
}
