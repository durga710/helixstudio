import "server-only";

/**
 * Usage-anomaly detection — flags abnormal AI-token spend per user using a
 * rolling baseline + z-score (the standard statistical-outlier method). Catches
 * a compromised account or runaway automation burning tokens far above the
 * user's own normal pattern. Pure stats, no dependencies.
 */

import { db } from "@/lib/db";

export interface AnomalyResult {
  anomalous: boolean;
  /** Standard deviations the latest period sits above the baseline mean. */
  z: number;
  /** Tokens in the most recent period. */
  recent: number;
  /** Mean tokens/period over the baseline window. */
  baseline: number;
  reason?: string;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Compare the most recent period against the baseline ones. Flags only when the
 * spike is BOTH a strong statistical outlier (z ≥ 3) AND large in absolute terms
 * (≥ 3× the baseline) — so a quiet user's small bump never trips it.
 */
export function detectAnomaly(baseline: number[], recent: number): AnomalyResult {
  if (baseline.length < 5) return { anomalous: false, z: 0, recent, baseline: 0 };
  const m = mean(baseline);
  const sd = stddev(baseline, m);
  const z = sd > 0 ? (recent - m) / sd : recent > m ? Infinity : 0;
  const anomalous = z >= 3 && recent >= m * 3 && recent > 50_000;
  return {
    anomalous,
    z: Number.isFinite(z) ? Number(z.toFixed(1)) : 99,
    recent,
    baseline: Math.round(m),
    reason: anomalous
      ? `Recent spend (${recent.toLocaleString()} tokens) is ${z === Infinity ? "far" : `${z.toFixed(1)}σ`} above this user's ~${Math.round(m).toLocaleString()}/hr baseline`
      : undefined,
  };
}

/** Bucket a user's recent AiUsageEvents into hourly token sums (newest last). */
export async function userUsageAnomaly(userId: string, hours = 24): Promise<AnomalyResult> {
  const since = new Date(Date.now() - hours * 3_600_000);
  let events: { tokens: number; createdAt: Date }[] = [];
  try {
    events = await db().aiUsageEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { tokens: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    return { anomalous: false, z: 0, recent: 0, baseline: 0 };
  }
  if (events.length === 0) return { anomalous: false, z: 0, recent: 0, baseline: 0 };

  const buckets = new Map<number, number>();
  for (const e of events) {
    const hour = Math.floor(e.createdAt.getTime() / 3_600_000);
    buckets.set(hour, (buckets.get(hour) ?? 0) + e.tokens);
  }
  const ordered = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
  const recent = ordered[ordered.length - 1] ?? 0;
  const baseline = ordered.slice(0, -1); // everything but the latest hour
  return detectAnomaly(baseline, recent);
}
