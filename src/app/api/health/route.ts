import { oauthProviders } from "@/lib/auth";
import { aiProviderName } from "@/lib/ai/provider";
import { redisEnabled } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** Public, secret-free deployment fingerprint — used to verify what's live. */
export async function GET() {
  return Response.json({
    ok: true,
    app: "helix-studio",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    region: process.env.VERCEL_REGION ?? null,
    demoMode: !process.env.DATABASE_URL && !oauthProviders.github && !oauthProviders.google,
    aiProvider: aiProviderName("anthropic"),
    // Presence booleans only — never values. One glance shows which env vars
    // reached this deployment.
    configured: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      DIRECT_URL: Boolean(process.env.DIRECT_URL),
      AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
      AUTH_GITHUB: oauthProviders.github,
      AUTH_GOOGLE: oauthProviders.google,
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
      REDIS: redisEnabled(),
      SENTRY: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    },
    time: new Date().toISOString(),
  });
}
