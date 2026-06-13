/**
 * Space plan limits + (Phase 3) Stripe wiring.
 *
 * A Space has one plan: "free" (capped) or "active" (a subscription bought
 * `seats` seats). The caps below are enforced server-side in the join and
 * assignment-creation routes and NEVER depend on Stripe being configured —
 * billingEnabled() only controls whether the upgrade UI is offered.
 *
 * Lapse behavior is deliberately non-destructive: an expired subscription
 * reverts the Space to free caps, which blocks NEW joins/assignments when
 * over the limit but never removes members or data.
 */

import Stripe from "stripe";
import { db } from "@/lib/db";

export const FREE_MEMBER_CAP = 5;
export const FREE_ASSIGNMENT_CAP = 2;

/** Grace window after currentPeriodEnd before an "active" plan stops counting,
 * so a slow renewal webhook can't flap a healthy Space back to free. */
export const LAPSE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export interface SpacePlanFields {
  plan: string;
  seats: number;
  currentPeriodEnd: Date | null;
}

export function billingEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_TEAM &&
      process.env.STRIPE_PRICE_EDU,
  );
}

export function isPlanActive(space: SpacePlanFields): boolean {
  if (space.plan !== "active") return false;
  if (!space.currentPeriodEnd) return true; // sync in flight — trust the flag
  return space.currentPeriodEnd.getTime() + LAPSE_GRACE_MS > Date.now();
}

export function memberCap(space: SpacePlanFields): number {
  return isPlanActive(space) ? space.seats : FREE_MEMBER_CAP;
}

export function canJoin(
  space: SpacePlanFields,
  currentMemberCount: number,
): { allowed: boolean; reason?: string } {
  const cap = memberCap(space);
  if (currentMemberCount < cap) return { allowed: true };
  return {
    allowed: false,
    reason: `This space is full (${currentMemberCount} of ${cap} seats). Ask the owner to add seats.`,
  };
}

export function canCreateAssignment(
  space: SpacePlanFields,
  currentAssignmentCount: number,
): { allowed: boolean; reason?: string } {
  if (isPlanActive(space)) return { allowed: true };
  if (currentAssignmentCount < FREE_ASSIGNMENT_CAP) return { allowed: true };
  return {
    allowed: false,
    reason: `The free plan includes ${FREE_ASSIGNMENT_CAP} assignments per space. Upgrade the space for unlimited assignments.`,
  };
}

/* ----------------------------- Stripe wiring ----------------------------- */

let stripeSingleton: Stripe | null = null;

/** Lazy so the module loads fine when Stripe env is absent. */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  stripeSingleton ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeSingleton;
}

/** Classroom Spaces get the education price automatically. */
export function priceIdForSpace(space: { kind: string }): string {
  return (space.kind === "classroom" ? process.env.STRIPE_PRICE_EDU : process.env.STRIPE_PRICE_TEAM) ?? "";
}

/* --------------------- user-level tier subscriptions --------------------- */
/*
 * Individual users subscribe to a tier (pro/team) the same way Spaces buy
 * seats. The webhook tells the two apart via subscription metadata (spaceId
 * vs userId). Tier ↔ quota mapping lives in agent-config.ts.
 *
 * Admin override interplay: the webhook only touches users it can match to a
 * Stripe subscription, so a tier an admin assigned by hand to a non-subscriber
 * is never stomped. For active subscribers Stripe owns `tier`; admins override
 * the LIMIT via User.tokenLimit, which always beats the tier default.
 */

export type PaidTier = "pro" | "team";

/** User-tier prices. STRIPE_PRICE_USER_TEAM is distinct from STRIPE_PRICE_TEAM
 * (the per-seat Space price above). */
export function userBillingEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_PRO &&
      process.env.STRIPE_PRICE_USER_TEAM,
  );
}

export function priceIdForTier(tier: PaidTier): string {
  return (tier === "team" ? process.env.STRIPE_PRICE_USER_TEAM : process.env.STRIPE_PRICE_PRO) ?? "";
}

export function tierForPriceId(priceId: string | null | undefined): PaidTier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_USER_TEAM) return "team";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return null;
}

/**
 * The subscription fields the webhook needs — structural (not Stripe's type)
 * so handlers work straight off event payloads. Newer Stripe API versions
 * put current_period_end on the subscription items.
 */
export interface SubscriptionLike {
  id: string;
  status: string;
  metadata?: { spaceId?: string; userId?: string } | null;
  current_period_end?: number | null;
  items?: {
    data?: Array<{
      quantity?: number | null;
      current_period_end?: number | null;
      price?: { id?: string | null } | null;
    }> | null;
  } | null;
}

/**
 * Idempotently write a subscription's state onto its Space. Lookup by
 * stripeSubscriptionId with a metadata.spaceId fallback (covers the very
 * first event racing checkout.session.completed).
 */
export async function applySubscriptionToSpace(sub: SubscriptionLike): Promise<boolean> {
  let space = await db().space.findUnique({ where: { stripeSubscriptionId: sub.id }, select: { id: true } });
  if (!space && sub.metadata?.spaceId) {
    space = await db().space.findUnique({ where: { id: sub.metadata.spaceId }, select: { id: true } });
  }
  if (!space) return false;

  const item = sub.items?.data?.[0];
  const periodEndSec = item?.current_period_end ?? sub.current_period_end ?? null;
  const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";

  await db().space.update({
    where: { id: space.id },
    data: active
      ? {
          plan: "active",
          seats: Math.max(1, item?.quantity ?? 1),
          stripeSubscriptionId: sub.id,
          currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000) : null,
        }
      : {
          // Canceled/unpaid: revert to free caps; keep the customer for a
          // future re-subscribe, release the subscription id.
          plan: "free",
          seats: FREE_MEMBER_CAP,
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
        },
  });
  return true;
}

/**
 * Idempotently write a user-tier subscription's state onto its User. Lookup
 * by stripeSubscriptionId with a metadata.userId fallback (covers the first
 * event racing checkout.session.completed). Mirrors applySubscriptionToSpace.
 */
export async function applySubscriptionToUser(sub: SubscriptionLike): Promise<boolean> {
  let user = await db().user.findUnique({ where: { stripeSubscriptionId: sub.id }, select: { id: true } });
  if (!user && sub.metadata?.userId) {
    user = await db().user.findUnique({ where: { id: sub.metadata.userId }, select: { id: true } });
  }
  if (!user) return false;

  const item = sub.items?.data?.[0];
  const periodEndSec = item?.current_period_end ?? sub.current_period_end ?? null;
  const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  const tier = tierForPriceId(item?.price?.id) ?? "pro";

  await db().user.update({
    where: { id: user.id },
    data: active
      ? {
          tier,
          stripeSubscriptionId: sub.id,
          currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000) : null,
        }
      : {
          // Canceled/unpaid: back to the free quota; keep the customer for a
          // future re-subscribe, release the subscription id.
          tier: "free",
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
        },
  });
  return true;
}

/**
 * Re-fetch a subscription from Stripe (the source of truth) and apply it to
 * whichever entity it belongs to (Space seats or a user tier). Used for
 * events that reference a subscription by id but don't carry the full
 * object — e.g. invoice.payment_failed. Returns false when the id is missing
 * or nothing matches.
 */
export async function syncSubscriptionById(subscriptionId: string | null | undefined): Promise<boolean> {
  if (!subscriptionId) return false;
  const sub = (await getStripe().subscriptions.retrieve(subscriptionId)) as unknown as SubscriptionLike;
  if (sub.metadata?.userId) return applySubscriptionToUser(sub);
  if (await applySubscriptionToSpace(sub)) return true;
  return applySubscriptionToUser(sub);
}
