/**
 * /api/billing/webhook — Stripe events. Unauthenticated (Stripe has no
 * session): authenticity comes from the signature over the RAW body, same
 * trust model as the git webhook. Handlers are payload-driven, idempotent
 * set-writes, so retries and duplicate deliveries are harmless.
 *
 *   checkout.session.completed            → link customer/subscription ids to the Space or User
 *   customer.subscription.created/updated → Space: plan/seats/period · User: tier/period
 *   customer.subscription.deleted         → back to the free plan/tier (non-destructive)
 *
 * Space subscriptions carry metadata.spaceId; user-tier subscriptions carry
 * metadata.userId (both set at checkout) — that's how handlers branch.
 */

import type Stripe from "stripe";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import {
  billingEnabled,
  userBillingEnabled,
  getStripe,
  applySubscriptionToSpace,
  applySubscriptionToUser,
  syncSubscriptionById,
  type SubscriptionLike,
} from "@/lib/billing";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if ((!billingEnabled() && !userBillingEnabled()) || !dbEnabled()) {
    return new Response("billing not configured", { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  // No guard() here, so warm the schema ourselves before any query.
  await schemaReady();

  try {
    return await handleEvent(event);
  } catch (e) {
    // Report and 500 so Stripe retries (handlers are idempotent).
    reportError(e, { at: "billing.webhook", type: event.type });
    return new Response("handler error", { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event): Promise<Response> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const userId = session.metadata?.userId; // user-tier checkout
      const spaceId = userId ? null : session.client_reference_id; // Space checkout
      if (userId && subscriptionId) {
        await db()
          .user.update({
            where: { id: userId },
            data: { stripeSubscriptionId: subscriptionId, ...(customerId ? { stripeCustomerId: customerId } : {}) },
          })
          .catch(() => {}); // unknown user (deleted meanwhile) — ignore
      } else if (spaceId && subscriptionId) {
        await db()
          .space.update({
            where: { id: spaceId },
            data: { stripeSubscriptionId: subscriptionId, ...(customerId ? { stripeCustomerId: customerId } : {}) },
          })
          .catch(() => {}); // unknown space (deleted meanwhile) — ignore
      }
      return new Response("ok", { status: 200 });
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as SubscriptionLike;
      const handled = sub.metadata?.userId
        ? await applySubscriptionToUser(sub)
        : await applySubscriptionToSpace(sub);
      return new Response(handled ? "ok" : "no match", { status: 200 });
    }

    case "invoice.payment_failed": {
      // A renewal failed — re-sync from Stripe so the space reflects the
      // un-advanced period end immediately (the 3-day grace in billing.ts
      // then applies from the due date, not weeks later).
      const invoice = event.data.object as { subscription?: string | { id: string } | null };
      const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      const handled = await syncSubscriptionById(subId);
      return new Response(handled ? "ok" : "no matching space", { status: 200 });
    }

    default:
      return new Response("ignored", { status: 200 });
  }
}
