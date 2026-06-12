import "server-only";

/**
 * Error reporting wrapper. Call `reportError(err, context)` from any catch
 * block that would otherwise swallow a failure. Two things always happen:
 *   1. a structured line is logged (improves ops even with no external tool);
 *   2. if SENTRY_DSN is set, the error is sent to Sentry with the context.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PORTABILITY NOTE — read before moving to AWS or Azure.
 *
 * This file is the ONLY place that knows about Sentry. Everything else calls
 * `reportError()`. To move providers, rewrite the body here — call sites don't
 * change:
 *   • AWS: send to CloudWatch Logs / X-Ray (or keep Sentry — it's host-agnostic
 *     and works from anywhere).
 *   • Azure: send to Application Insights.
 *   • Vendor-neutral: emit OpenTelemetry spans/logs (Sentry can also ingest
 *     OTel, so you can stay on Sentry while speaking a neutral wire format).
 * Sentry does NOT care where the app is hosted — moving clouds doesn't force a
 * change here at all; this note is only for if you also want to change the
 * monitoring vendor.
 *
 * We use @sentry/node (not the full @sentry/nextjs plugin) and import it lazily
 * so it only loads when a DSN is configured — keeps it out of the bundle and
 * keeps the dependency easy to swap.
 * ───────────────────────────────────────────────────────────────────────────
 */

type SentryModule = typeof import("@sentry/node");

let initPromise: Promise<SentryModule | null> | undefined;

function ensureSentry(): Promise<SentryModule | null> {
  initPromise ??= (async () => {
    if (!process.env.SENTRY_DSN) return null;
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0, // errors only for now; turn up for performance tracing
    });
    return Sentry;
  })().catch(() => null);
  return initPromise;
}

/** Report a caught error. Fire-and-forget; never throws. */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  // Structured local log first — this alone gives ops something to grep.
  console.error("[helix-error]", context ? JSON.stringify(context) : "", err);
  void ensureSentry()
    .then((Sentry) => {
      if (Sentry) Sentry.captureException(err, context ? { extra: context } : undefined);
    })
    .catch(() => {});
}
