import "server-only";

import * as Sentry from "@sentry/nextjs";

/**
 * Error reporting wrapper. Call `reportError(err, context)` from any catch
 * block that would otherwise swallow a failure. Two things always happen:
 *   1. a structured line is logged (useful even with no external tool);
 *   2. the error is sent to Sentry with the context.
 *
 * Sentry is initialized globally by the instrumentation files
 * (src/instrumentation.ts for server/edge, src/instrumentation-client.ts for
 * the browser). When no DSN is configured those inits are no-ops, so
 * captureException here is harmless and only the structured log remains.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PORTABILITY NOTE — read before moving to AWS or Azure.
 *
 * Sentry lives ONLY in this file plus the two instrumentation files. App code
 * calls reportError(); the instrumentation files do Sentry.init(). To move
 * providers, rewrite the body here and swap the init in the instrumentation
 * files — call sites don't change:
 *   • AWS: CloudWatch Logs / X-Ray (or keep Sentry — it's host-agnostic).
 *   • Azure: Application Insights.
 *   • Vendor-neutral: OpenTelemetry (Sentry can also ingest OTel).
 * Sentry does not care where the app is hosted — changing clouds does not
 * force a change here; this note is only for changing the monitoring vendor.
 * ───────────────────────────────────────────────────────────────────────────
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  // Structured local log first — gives ops something to grep even sans Sentry.
  console.error("[helix-error]", context ? JSON.stringify(context) : "", err);
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // never let error reporting throw
  }
}
