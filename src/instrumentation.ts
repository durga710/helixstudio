import * as Sentry from "@sentry/nextjs";

/**
 * Server + edge Sentry init (Next.js runs this once per runtime at boot).
 * Client init lives in instrumentation-client.ts. DSN gating: if no DSN is
 * set, init is a no-op and captureException becomes harmless — the app runs
 * unchanged. See src/lib/observability.ts for the reportError() wrapper.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      // Only report from real deployments — local dev errors shouldn't burn the
      // (free-tier) error quota.
      enabled: process.env.NODE_ENV === "production",
      tracesSampleRate: 0, // no performance tracing (that quota stays untouched)
    });
  }
}

// Captures errors thrown in server components / route handlers (Next 15+ hook).
export const onRequestError = Sentry.captureRequestError;
