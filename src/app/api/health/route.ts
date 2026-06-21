import { oauthProviders } from "@/lib/auth";
import { aiProviderName } from "@/lib/ai/provider";
import { bedrockEnabled } from "@/lib/ai/bedrock";
import { openaiHouseForAll } from "@/lib/ai/keys";
import { redisEnabled } from "@/lib/redis";
import { adminEmails } from "@/lib/admin";

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
    // The house default model id when OPENAI_FOR_ALL is on (non-secret), else null.
    houseModel: openaiHouseForAll() ? (process.env.OPENAI_MODEL || "gpt-5-mini") : null,
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
      // Bedrock token presence (the value that gates Bedrock chat) + its project
      // id. True here means AWS_BEARER_TOKEN_BEDROCK reached this deployment.
      BEDROCK: bedrockEnabled(),
      BEDROCK_WORKSPACE_ID: Boolean(process.env.BEDROCK_WORKSPACE_ID),
      REDIS: redisEnabled(),
      SENTRY: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
      // House OpenAI: a strong GPT model is the default for ALL users (vs the
      // admin-only platform key). True only when OPENAI_FOR_ALL=1 + a key reached
      // this deployment. The model id is non-secret — handy to confirm gpt-5.5 is live.
      OPENAI_FOR_ALL: openaiHouseForAll(),
      // Turbo parallel-build engine (per-request toggle still required).
      HELIX_TURBO: process.env.HELIX_TURBO === "1",
      // Count only — proves /admin is gated and the allowlist env reached this
      // deployment, without exposing who's on it.
      ADMIN_ALLOWLIST: adminEmails().length,
    },
    time: new Date().toISOString(),
  });
}
