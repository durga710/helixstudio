/**
 * Multi-provider git: shared contract.
 *
 * Helix talks to git hosts through the GitProvider interface — one adapter
 * per host (github.ts, gitlab.ts, bitbucket.ts, azure.ts, gitea.ts), all
 * raw fetch, no SDKs. Auth rides an AsyncLocalStorage context (withGitAuth)
 * so deep call chains (workspace overlay → tree/file fetches) never thread
 * tokens through signatures. New hosts connect by user-pasted token only —
 * zero-cost, no OAuth app registrations, self-hosted instances welcome.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export {
  GIT_PROVIDERS,
  PROVIDER_META,
  isValidRepoId,
  type GitProviderName,
  type ProviderMeta,
} from "./meta";
import type { GitProviderName } from "./meta";

/** Everything an adapter needs to call its host as the signed-in user. */
export interface GitAuth {
  provider: GitProviderName;
  token: string;
  /** Self-hosted base URL (gitlab/gitea); empty = the cloud default. */
  baseUrl?: string;
  /** Azure DevOps organization. */
  org?: string;
}

const authContext = new AsyncLocalStorage<GitAuth>();

export function withGitAuth<T>(auth: GitAuth | null | undefined, fn: () => Promise<T>): Promise<T> {
  return auth ? authContext.run(auth, fn) : fn();
}

export function activeAuth(): GitAuth | undefined {
  return authContext.getStore();
}

export function hasGitAuth(): boolean {
  return Boolean(activeAuth());
}

/* ------------------------------- shapes ------------------------------- */

export interface RepoListEntry {
  repo: string; // provider repo id: "owner/name" ("org/project/repo" for azure)
  private: boolean;
  defaultBranch: string;
  pushedAt: string | null;
}

export interface RepoTreeEntry {
  path: string;
  size: number;
}

export interface PushOpts {
  branch: string;
  message: string;
  files: { path: string; content: string }[];
  deletions?: string[];
}

export interface GitProvider {
  name: GitProviderName;
  /** Repos the active token can reach. `unauthorized` → prompt to connect. */
  listRepos(): Promise<{ repos: RepoListEntry[] } | { unauthorized: true } | null>;
  /** All text-file paths on a branch; { branch, files: [] } for empty repos. */
  fetchRepoTree(repo: string, ref?: string): Promise<{ branch: string; files: RepoTreeEntry[] } | null>;
  /** One file's text content. Null if missing/binary/too large. */
  fetchRepoFileContent(repo: string, path: string, ref?: string): Promise<{ content: string } | null>;
  /**
   * Commit files (+ deletions) to a branch in ONE commit, creating the
   * branch (and the root commit on an empty repo) when needed. Must return
   * the branch the commit actually landed on.
   */
  pushFilesToRepo(repo: string, opts: PushOpts): Promise<{ branch: string; commitSha: string; commitUrl: string } | { error: string }>;
  createRepo(name: string, opts?: { description?: string; isPrivate?: boolean }): Promise<{ repo: string; url: string; defaultBranch: string } | { error: string }>;
  /** PR / merge request for `head` against the default branch. */
  createPullRequest(repo: string, opts: { title: string; body: string; head: string }): Promise<{ url: string } | { error: string }>;
}

/**
 * Self-hosted base URLs are user input — keep them boring: https only
 * (http allowed for localhost), no trailing slash, no credentials.
 */
export function sanitizeBaseUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) return null;
  return url.origin + url.pathname.replace(/\/+$/, "");
}
