import "server-only";

/**
 * AI usage recording — the single write path for token spend. Every AI call
 * site goes through here so three things always move together:
 *   - User.tokensUsed   (lifetime counter — admin stats, guest limit)
 *   - User.periodTokens (current-month counter — tier quotas)
 *   - AiUsageEvent      (one row per call — admin history + CSV export)
 *
 * Use aiUsageOps() spread into an existing db().$transaction so message
 * persistence stays atomic; recordAiUsage() is the standalone variant for
 * call sites without a surrounding transaction. Metering must never fail a
 * user-visible reply — recordAiUsage swallows and logs.
 */

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { usageAccounting } from "@/lib/usage-accounting";

export type AiUsageKind =
  | "chat"
  | "review"
  | "ledger_ask"
  | "undo_preview"
  | "rerank"
  | "template_classify"
  | "library_scout"
  | "intake_curation"
  | "embed"
  | "tutor"
  | "compaction"
  | "lab_guide"
  | "video"
  | "video_script";

export interface AiUsageInput {
  userId: string;
  tokens: number;
  kind: AiUsageKind;
  provider?: string;
  model?: string;
  workspaceId?: string | null;
  /**
   * Tokens already reserved for this turn by reserveTokenBudget (token-budget.ts).
   * The reservation pre-incremented both counters by this amount to close the
   * concurrent-turn quota race (H4); recording therefore only needs to move the
   * counters by the DELTA to the real spend (`tokens - reserved`), which may be
   * negative when the turn came in under its reserve. The usage-history row still
   * logs the true `tokens`. Default 0 = no reservation (legacy behaviour).
   */
  reserved?: number;
}

/** Usage-history rows older than this are pruned (lifetime totals live on
 * the User row, so pruning loses nothing the quotas depend on). */
export const USAGE_RETENTION_DAYS = 90;

/** The Prisma ops for one spend — spread into an existing $transaction. */
export function aiUsageOps(input: AiUsageInput): Prisma.PrismaPromise<unknown>[] {
  const reserved = input.reserved ?? 0;
  // Nothing to record AND nothing to settle.
  if (input.tokens <= 0 && reserved === 0) return [];
  const { counterDelta, writeEvent } = usageAccounting(input.tokens, reserved);

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (counterDelta !== 0) {
    ops.push(
      db().user.update({
        where: { id: input.userId },
        data: {
          tokensUsed: { increment: counterDelta },
          periodTokens: { increment: counterDelta },
        },
      }),
    );
  }
  // The usage-history row always logs the TRUE token count (not the delta); a
  // zero-token spend writes no row, matching the prior behaviour.
  if (writeEvent) {
    ops.push(
      db().aiUsageEvent.create({
        data: {
          userId: input.userId,
          workspaceId: input.workspaceId ?? null,
          kind: input.kind,
          provider: input.provider ?? "",
          model: input.model ?? "",
          tokens: input.tokens,
        },
      }),
    );
  }
  return ops;
}

/** Standalone variant for sites without a transaction. Never throws. */
export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  const ops = aiUsageOps(input);
  if (ops.length === 0) return;
  try {
    await db().$transaction(ops);
  } catch (e) {
    console.error("[ai-usage] record failed", e);
  }
  // Opportunistic retention sweep on ~1% of calls — a cheap range delete on
  // the createdAt index; fire-and-forget.
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    db()
      .aiUsageEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
      .catch(() => {});
  }
}
