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

/**
 * The subscription fields the webhook needs — structural (not Stripe's type)
 * so handlers work straight off event payloads. Newer Stripe API versions
 * put current_period_end on the subscription items.
 */
export interface SubscriptionLike {
  id: string;
  status: string;
  metadata?: { spaceId?: string } | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ quantity?: number | null; current_period_end?: number | null }> | null } | null;
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
