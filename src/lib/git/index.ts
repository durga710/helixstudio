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
 * The signed-in user's credentials for a provider, or null when not
 * connected. GitHub keeps its priority order (pasted PAT → OAuth token);
 * the other hosts are pasted-token only, plus their config (base URL, org).
 */
export async function getGitAuth(userId: string, provider: string): Promise<GitAuth | null> {
  if (!dbEnabled() || !isProviderName(provider)) return null;
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

export { withGitAuth, activeAuth, PROVIDER_META, GIT_PROVIDERS, isValidRepoId, sanitizeBaseUrl } from "./types";
export type { GitAuth, GitProvider, GitProviderName, RepoListEntry, PushOpts } from "./types";
