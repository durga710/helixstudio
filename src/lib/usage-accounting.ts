/**
 * Pure token-usage accounting — no server-only / db imports, so it is unit
 * testable under `node --test`. Used by ai-usage.ts (aiUsageOps) to reconcile a
 * turn's true spend against any budget the gate reserved up front (H4).
 */

/**
 * Decide how to record one spend, given the true `tokens` and any `reserved`
 * amount the gate already pre-incremented onto the metered counters.
 *
 *  - `counterDelta`: how far to move User.tokensUsed/periodTokens. The gate
 *    already added `reserved`, so this settles to the true spend and may be
 *    negative (turn came in under its reserve) or a pure refund (tokens = 0).
 *  - `writeEvent`: whether to write a usage-history row (only for real spend).
 */
export function usageAccounting(
  tokens: number,
  reserved: number,
): { counterDelta: number; writeEvent: boolean } {
  return { counterDelta: tokens - reserved, writeEvent: tokens > 0 };
}
