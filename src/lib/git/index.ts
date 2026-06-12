import "server-only";

/**
 * Provider registry + per-user auth resolution. The rest of the app asks
 * two questions: "which adapter?" (getProvider) and "how do I call it as
 * this user?" (getGitAuth → withGitAuth). Everything host-specific stays
 * inside the adapter files.
 */

import { db, dbEnabled, schemaReady } from "@/lib/db";
import { githubProvider } from "./github";
import { gitlabProvider } from "./gitlab";
import { bitbucketProvider } from "./bitbucket";
import { azureProvider } from "./azure";
import { giteaProvider } from "./gitea";
import type { GitAuth, GitProvider, GitProviderName } from "./types";

const REGISTRY: Record<GitProviderName, GitProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
  bitbucket: bitbucketProvider,
  azure: azureProvider,
  gitea: giteaProvider,
};

export function getProvider(name: string): GitProvider {
  return REGISTRY[(name as GitProviderName) in REGISTRY ? (name as GitProviderName) : "github"];
}

export function isProviderName(name: string): name is GitProviderName {
  return name in REGISTRY;
}

/**
 * Short-TTL cache for resolved credentials — nearly every workspace API call
 * pays this lookup (2 DB round-trips for GitHub), and tokens change rarely.
 * Only POSITIVE results are cached: a user who just connected a host must
 * see it work immediately, while a revoked cached token simply fails at the
 * provider and ages out. Process-local; survives HMR via globalThis.
 * Deliberately NOT in the shared Redis layer (src/lib/server-cache.ts):
 * tokens don't belong in a second store — a cold instance just pays the two
 * DB reads once per minute.
 */
const GIT_AUTH_TTL_MS = 60_000;
const globalAuthCache = globalThis as unknown as {
  __helixGitAuthCache?: Map<string, { at: number; auth: GitAuth }>;
};

/** Drop a user's cached credentials (call after token settings change). */
export function invalidateGitAuth(userId: string): void {
  const cache = globalAuthCache.__helixGitAuthCache;
  if (!cache) return;
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

/**
 * The signed-in user's credentials for a provider, or null when not
 * connected. GitHub keeps its priority order (pasted PAT → OAuth token);
 * the other hosts are pasted-token only, plus their config (base URL, org).
 */
export async function getGitAuth(userId: string, provider: string): Promise<GitAuth | null> {
  if (!dbEnabled() || !isProviderName(provider)) return null;

  const cache = (globalAuthCache.__helixGitAuthCache ??= new Map());
  const cacheKey = `${userId}:${provider}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < GIT_AUTH_TTL_MS) return hit.auth;

  const auth = await getGitAuthUncached(userId, provider as GitProviderName);
  if (auth) cache.set(cacheKey, { at: Date.now(), auth });
  return auth;
}

async function getGitAuthUncached(userId: string, provider: GitProviderName): Promise<GitAuth | null> {
  await schemaReady();

  if (provider === "github") {
    const [prefs, account] = await Promise.all([
      db().userPreferences.findUnique({ where: { userId }, select: { githubToken: true } }),
      db().account.findFirst({ where: { userId, provider: "github" }, select: { access_token: true } }),
    ]);
    const token = prefs?.githubToken || account?.access_token;
    return token ? { provider, token } : null;
  }

  const prefs = await db().userPreferences.findUnique({
    where: { userId },
    select: {
      gitlabToken: true,
      gitlabBaseUrl: true,
      bitbucketToken: true,
      azureToken: true,
      azureOrg: true,
      giteaToken: true,
      giteaBaseUrl: true,
    },
  });
  if (!prefs) return null;

  switch (provider) {
    case "gitlab":
      return prefs.gitlabToken
        ? { provider, token: prefs.gitlabToken, baseUrl: prefs.gitlabBaseUrl ?? undefined }
        : null;
    case "bitbucket":
      return prefs.bitbucketToken ? { provider, token: prefs.bitbucketToken } : null;
    case "azure":
      return prefs.azureToken && prefs.azureOrg
        ? { provider, token: prefs.azureToken, org: prefs.azureOrg }
        : null;
    case "gitea":
      return prefs.giteaToken && prefs.giteaBaseUrl
        ? { provider, token: prefs.giteaToken, baseUrl: prefs.giteaBaseUrl }
        : null;
  }
}

/** Which hosts the user can act on right now (token + required config). */
export async function getGitConnections(userId: string): Promise<Record<GitProviderName, boolean>> {
  const none: Record<GitProviderName, boolean> = {
    github: false,
    gitlab: false,
    bitbucket: false,
    azure: false,
    gitea: false,
  };
  if (!dbEnabled()) return none;
  await schemaReady();

  const [prefs, githubAccount] = await Promise.all([
    db().userPreferences.findUnique({
      where: { userId },
      select: {
        githubToken: true,
        gitlabToken: true,
        bitbucketToken: true,
        azureToken: true,
        azureOrg: true,
        giteaToken: true,
        giteaBaseUrl: true,
      },
    }),
    db().account.findFirst({ where: { userId, provider: "github" }, select: { access_token: true } }),
  ]);

  return {
    github: Boolean(prefs?.githubToken || githubAccount?.access_token),
    gitlab: Boolean(prefs?.gitlabToken),
    bitbucket: Boolean(prefs?.bitbucketToken),
    azure: Boolean(prefs?.azureToken && prefs?.azureOrg),
    gitea: Boolean(prefs?.giteaToken && prefs?.giteaBaseUrl),
  };
}

export { withGitAuth, activeAuth, PROVIDER_META, GIT_PROVIDERS, isValidRepoId, sanitizeBaseUrl } from "./types";
export type { GitAuth, GitProvider, GitProviderName, RepoListEntry, PushOpts } from "./types";
