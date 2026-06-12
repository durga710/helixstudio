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
