import "server-only";

/**
 * Token-budget enforcement — the single pre-spend gate for every AI call.
 *
 * Limits, in order of precedence:
 *   1. suspendedAt set            → blocked outright (admin override)
 *   2. admin User.tokenLimit      → absolute monthly cap (0 = AI disabled);
 *                                   for guests it replaces the lifetime cap
 *   3. guests                     → lifetime GUEST_TOKEN_LIMIT (existing UX:
 *                                   the sign-in CTA, code GUEST_LIMIT)
 *   4. members                    → TIER_TOKEN_LIMITS[tier] per UTC calendar
 *                                   month, metered by User.periodTokens with
 *                                   a lazy reset on month rollover
 *
 * Checked BEFORE spend; recording happens after (ai-usage.ts). A user can
 * therefore overshoot by at most one turn (bounded by maxTurnTokens) — the
 * same accepted semantics as the original guest limit.
 */

import { db } from "@/lib/db";
import { GUEST_TOKEN_LIMIT } from "@/lib/auth";
import { tierMonthlyLimit } from "@/lib/agent-config";
import { isAdminEmail } from "@/lib/admin";

export type BudgetCode = "GUEST_LIMIT" | "TOKEN_LIMIT" | "SUSPENDED";

export interface BudgetUser {
  id: string;
  isGuest: boolean;
  tier: string;
  tokensUsed: number;
  tokenLimit: number | null;
  periodTokens: number;
  suspendedAt: Date | null;
}

export type BudgetResult =
  | {
      ok: true;
      /** null when the user row is missing (treated as unmetered). */
      user: BudgetUser | null;
      /** The effective cap (null = unlimited). */
      limit: number | null;
      /** Tokens left under the cap (null = unlimited). */
      remaining: number | null;
      /**
       * Tokens this call atomically reserved against the cap (0 for the
       * read-only checkTokenBudget, or for unmetered admins/unlimited users).
       * The caller MUST pass this back to aiUsageOps({ reserved }) after the
       * turn, or release it via releaseTokenReservation on an error path.
       */
      reserved: number;
    }
  | { ok: false; code: BudgetCode; error: string };

/**
 * A representative upper-bound for one AI turn, reserved up front so concurrent
 * turns can't each slip past a read-only check (H4). It does NOT need to be
 * exact: the real spend is reconciled in aiUsageOps afterwards. A larger value
 * tightens the concurrent-overshoot bound (more turns blocked near the cap); a
 * smaller one lets more parallel turns through. ~one large build turn.
 */
export const TURN_TOKEN_RESERVE = 16_000;

/** The cap that applies to this user: admin override beats everything;
 * guests fall back to the lifetime guest limit, members to their tier. */
export function effectiveLimit(u: Pick<BudgetUser, "isGuest" | "tier" | "tokenLimit">): number | null {
  if (u.tokenLimit !== null) return u.tokenLimit;
  return u.isGuest ? GUEST_TOKEN_LIMIT : tierMonthlyLimit(u.tier);
}

function startOfCurrentMonthUTC(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** One read (plus a rare rollover write) + the checks. Call before AI spend. */
export async function checkTokenBudget(userId: string): Promise<BudgetResult> {
  const u = await db().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isGuest: true,
      tier: true,
      tokensUsed: true,
      tokenLimit: true,
      periodTokens: true,
      suspendedAt: true,
      periodStart: true,
    },
  });
  if (!u) return { ok: true, user: null, limit: null, remaining: null, reserved: 0 };

  // Admins (platform operators, by ADMIN_EMAILS) are never metered — unlimited
  // AI, no quota. They run the product; quota is for members/guests.
  if (isAdminEmail(u.email)) {
    return { ok: true, user: u, limit: null, remaining: null, reserved: 0 };
  }

  if (u.suspendedAt) {
    return {
      ok: false,
      code: "SUSPENDED",
      error: "This account is suspended. Contact the administrator.",
    };
  }

  // Guests meter against the lifetime counter (existing semantics + copy).
  if (u.isGuest) {
    const limit = u.tokenLimit ?? GUEST_TOKEN_LIMIT;
    if (u.tokensUsed >= limit) {
      return {
        ok: false,
        code: "GUEST_LIMIT",
        error: `You've used your guest allowance (${limit.toLocaleString()} AI tokens). Sign in with GitHub or Google to keep building — it's free, and your work can push to your own repos.`,
      };
    }
    return { ok: true, user: u, limit, remaining: Math.max(0, limit - u.tokensUsed), reserved: 0 };
  }

  // Members meter per UTC calendar month — lazily reset on rollover so no
  // cron is needed (the admin page shows the period a stale counter covers).
  const monthStart = startOfCurrentMonthUTC();
  if (u.periodStart < monthStart) {
    await db().user.update({
      where: { id: userId },
      data: { periodTokens: 0, periodStart: monthStart },
    });
    u.periodTokens = 0;
  }

  const limit = effectiveLimit(u);
  if (limit !== null && u.periodTokens >= limit) {
    return {
      ok: false,
      code: "TOKEN_LIMIT",
      error: `You've used your monthly AI token quota (${limit.toLocaleString()} tokens). Upgrade your plan in Settings, or contact the administrator to raise your limit.`,
    };
  }

  return {
    ok: true,
    user: u,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - u.periodTokens),
    reserved: 0,
  };
}

/**
 * Atomic counter-bump variant of checkTokenBudget for the recording path (H4).
 *
 * checkTokenBudget reads-then-decides, so N concurrent turns can all pass the
 * gate before any of them records its spend — a free/guest user can fire many
 * parallel builds straight past the cap. This instead bumps the metered counter
 * by `reserve` in the SAME conditional UPDATE that checks it (`WHERE counter <
 * limit`): once one request's reservation pushes the counter to the cap, the
 * next concurrent request's UPDATE matches no row and is rejected. The reserve
 * is an estimate — the caller reconciles it to the true spend via
 * aiUsageOps({ reserved }), or refunds it with releaseTokenReservation on an
 * error path. Unmetered users (admin / unlimited) reserve nothing.
 */
export async function reserveTokenBudget(
  userId: string,
  reserve: number = TURN_TOKEN_RESERVE,
): Promise<BudgetResult> {
  // Reuse all the precedence + month-rollover logic; it also tells us the cap
  // and whether the user is a guest (gated on the lifetime counter) or a member
  // (gated on the monthly counter).
  const base = await checkTokenBudget(userId);
  if (!base.ok) return base;

  const u = base.user;
  // Missing row, admin, or unlimited cap → nothing to meter, nothing to reserve.
  if (!u || base.limit === null || reserve <= 0) return { ...base, reserved: 0 };

  const limit = base.limit;
  const gateField = u.isGuest ? "tokensUsed" : "periodTokens";

  // CAS: only the user still strictly under the cap gets the bump. Both counters
  // move together so aiUsageOps' delta reconciliation stays symmetric.
  const res = await db().user.updateMany({
    where: { id: userId, [gateField]: { lt: limit } },
    data: { tokensUsed: { increment: reserve }, periodTokens: { increment: reserve } },
  });

  if (res.count === 0) {
    // Someone else's concurrent turn (or this user's own prior spend) reached the
    // cap between the read and the bump — reject with the same code/copy the
    // read-only gate would have used.
    return u.isGuest
      ? {
          ok: false,
          code: "GUEST_LIMIT",
          error: `You've used your guest allowance (${limit.toLocaleString()} AI tokens). Sign in with GitHub or Google to keep building — it's free, and your work can push to your own repos.`,
        }
      : {
          ok: false,
          code: "TOKEN_LIMIT",
          error: `You've used your monthly AI token quota (${limit.toLocaleString()} tokens). Upgrade your plan in Settings, or contact the administrator to raise your limit.`,
        };
  }

  return { ...base, reserved: reserve };
}

/**
 * Refund a reservation made by reserveTokenBudget when the turn produced no
 * recorded spend (provider error before billing, a fallback that re-runs the
 * whole turn, etc.). Never throws — a failed refund must not break the response.
 */
export async function releaseTokenReservation(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    await db().user.update({
      where: { id: userId },
      data: { tokensUsed: { increment: -amount }, periodTokens: { increment: -amount } },
    });
  } catch (e) {
    console.error("[token-budget] reservation release failed", e);
  }
}
