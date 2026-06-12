import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side Sentry init — captures unhandled client errors and React render
 * crashes. DSN is the public NEXT_PUBLIC_SENTRY_DSN (safe to expose; a DSN can
 * only send events, not read them). No-op when the DSN is absent.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Only report from real deployments — local dev errors shouldn't burn quota.
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0, // no performance tracing (that quota stays untouched)
  // session replay OFF (its own quota + privacy); flip on later if wanted
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
