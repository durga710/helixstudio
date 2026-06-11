import { oauthProviders } from "@/lib/auth";
import { aiProviderName } from "@/lib/ai/provider";

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
    aiProvider: aiProviderName(),
    authSecretConfigured: Boolean(process.env.AUTH_SECRET),
    time: new Date().toISOString(),
  });
}
