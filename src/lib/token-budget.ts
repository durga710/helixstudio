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
    }
  | { ok: false; code: BudgetCode; error: string };

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
      isGuest: true,
      tier: true,
      tokensUsed: true,
      tokenLimit: true,
      periodTokens: true,
      suspendedAt: true,
      periodStart: true,
    },
  });
  if (!u) return { ok: true, user: null, limit: null, remaining: null };

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
    return { ok: true, user: u, limit, remaining: Math.max(0, limit - u.tokensUsed) };
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
  };
}
