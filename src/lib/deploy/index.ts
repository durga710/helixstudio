import "server-only";

/**
 * Deploy-provider registry + per-user auth resolution — the deploy analogue
 * of src/lib/git/index.ts. Routes ask two things: "which adapter?"
 * (getDeployProvider) and "how do I call it as this user?" (getDeployAuth).
 *
 * Vercel is implemented; Netlify / Cloudflare Pages / Render are registered
 * as not-yet-implemented slots so the UI can show the roadmap and each lands
 * as a single adapter file later.
 */

import { db, dbEnabled, schemaReady } from "@/lib/db";
import type { DeployAuth, DeployProvider, DeployProviderName } from "./types";
import { vercelProvider } from "./vercel";
import { netlifyProvider } from "./netlify";
import { cloudflareProvider } from "./cloudflare";
import { renderProvider } from "./render";

const REGISTRY: Record<DeployProviderName, DeployProvider> = {
  vercel: vercelProvider,
  netlify: netlifyProvider,
  cloudflare: cloudflareProvider,
  render: renderProvider,
};

export const DEPLOY_PROVIDERS: { name: DeployProviderName; label: string; implemented: boolean }[] = (
  Object.values(REGISTRY)
).map((p) => ({ name: p.name, label: p.label, implemented: p.implemented }));

export function isDeployProviderName(name: string): name is DeployProviderName {
  return name in REGISTRY;
}

export function getDeployProvider(name: string): DeployProvider | null {
  return isDeployProviderName(name) ? REGISTRY[name] : null;
}

/**
 * Short-TTL cache for resolved deploy tokens (same rationale as getGitAuth):
 * positive results only, process-local, dropped on settings change. Tokens
 * stay out of the shared Redis layer.
 */
const TTL_MS = 60_000;
const globalCache = globalThis as unknown as {
  __helixDeployAuth?: Map<string, { at: number; auth: DeployAuth }>;
};

export function invalidateDeployAuth(userId: string): void {
  const cache = globalCache.__helixDeployAuth;
  if (!cache) return;
  for (const key of cache.keys()) if (key.startsWith(`${userId}:`)) cache.delete(key);
}

export async function getDeployAuth(userId: string, provider: string): Promise<DeployAuth | null> {
  if (!dbEnabled() || !isDeployProviderName(provider)) return null;

  const cache = (globalCache.__helixDeployAuth ??= new Map());
  const key = `${userId}:${provider}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.auth;

  await schemaReady();
  const row = await db().deployConnection.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { token: true, config: true },
  });
  if (!row?.token) return null;
  const auth: DeployAuth = {
    provider,
    token: row.token,
    config: (row.config as Record<string, unknown> | null) ?? undefined,
  };
  cache.set(key, { at: Date.now(), auth });
  return auth;
}

/** Which platforms the user has connected (token present). For Settings. */
export async function getDeployConnections(userId: string): Promise<Record<DeployProviderName, boolean>> {
  const out: Record<DeployProviderName, boolean> = {
    vercel: false,
    netlify: false,
    cloudflare: false,
    render: false,
  };
  if (!dbEnabled()) return out;
  await schemaReady();
  const rows = await db().deployConnection.findMany({ where: { userId }, select: { provider: true } });
  for (const r of rows) if (isDeployProviderName(r.provider)) out[r.provider] = true;
  return out;
}
