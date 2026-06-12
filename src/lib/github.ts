import "server-only";

/**
 * Back-compat shim — GitHub logic now lives in src/lib/git/github.ts behind
 * the multi-provider GitProvider interface (src/lib/git/types.ts). Existing
 * imports keep working; new code should use src/lib/git/index.ts instead.
 */

import { withGitAuth } from "./git/types";

export {
  listAccessibleRepos,
  fetchRepoTree,
  fetchRepoFileContent,
  pushFilesToRepo,
  createRepo,
  createPullRequest,
  type RepoTreeEntry,
} from "./git/github";

export function withGitHubToken<T>(token: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return withGitAuth(token ? { provider: "github", token } : null, fn);
}
