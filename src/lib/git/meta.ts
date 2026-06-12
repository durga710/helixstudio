/**
 * Client-safe provider metadata — no node imports, importable from React
 * components (the connect modal, push dialog, settings) and from the
 * server-side adapter layer alike.
 */

export type GitProviderName = "github" | "gitlab" | "bitbucket" | "azure" | "gitea";

export const GIT_PROVIDERS: GitProviderName[] = ["github", "gitlab", "bitbucket", "azure", "gitea"];

export interface ProviderMeta {
  label: string;
  prNoun: string; // "pull request" | "merge request"
  repoIdHint: string; // placeholder for manual entry
  /** Where the user creates a token + scopes to grant. */
  tokenHelp: string;
  tokenPlaceholder: string;
  needsBaseUrl: "no" | "optional" | "required";
  baseUrlPlaceholder?: string;
  needsOrg?: boolean;
}

export const PROVIDER_META: Record<GitProviderName, ProviderMeta> = {
  github: {
    label: "GitHub",
    prNoun: "pull request",
    repoIdHint: "owner/repo",
    tokenHelp: "GitHub → Settings → Developer settings → Fine-grained tokens (Contents + Pull requests read/write).",
    tokenPlaceholder: "github_pat_… or ghp_…",
    needsBaseUrl: "no",
  },
  gitlab: {
    label: "GitLab",
    prNoun: "merge request",
    repoIdHint: "group/project",
    tokenHelp: "GitLab → Preferences → Access tokens — scopes: api, read_repository, write_repository.",
    tokenPlaceholder: "glpat-…",
    needsBaseUrl: "optional",
    baseUrlPlaceholder: "https://gitlab.example.com (empty = gitlab.com)",
  },
  bitbucket: {
    label: "Bitbucket",
    prNoun: "pull request",
    repoIdHint: "workspace/repo",
    tokenHelp: "Atlassian account → Security → API tokens — scopes: repository read/write, pull requests write.",
    tokenPlaceholder: "API token",
    needsBaseUrl: "no",
  },
  azure: {
    label: "Azure DevOps",
    prNoun: "pull request",
    repoIdHint: "org/project/repo",
    tokenHelp: "dev.azure.com → User settings → Personal access tokens — scope: Code (read & write).",
    tokenPlaceholder: "Personal access token",
    needsBaseUrl: "no",
    needsOrg: true,
  },
  gitea: {
    label: "Gitea / Forgejo",
    prNoun: "pull request",
    repoIdHint: "owner/repo",
    tokenHelp: "Your instance → Settings → Applications → Generate token (repository read/write). Codeberg works too.",
    tokenPlaceholder: "access token",
    needsBaseUrl: "required",
    baseUrlPlaceholder: "https://codeberg.org or your Gitea/Forgejo URL",
  },
};

const SEGMENT = /^[\w.-]+$/;

/**
 * Repo identity per provider: 2 segments for github/bitbucket/gitea,
 * 2+ for gitlab (sub-groups), exactly 3 for azure (org/project/repo —
 * project segment may contain spaces).
 */
export function isValidRepoId(provider: GitProviderName, repo: string): boolean {
  if (!repo || repo.length > 300) return false;
  const segs = repo.split("/");
  if (segs.some((s) => !s.trim())) return false;
  switch (provider) {
    case "azure":
      return segs.length === 3 && segs.every((s) => /^[\w. -]+$/.test(s));
    case "gitlab":
      return segs.length >= 2 && segs.every((s) => SEGMENT.test(s));
    default:
      return segs.length === 2 && segs.every((s) => SEGMENT.test(s));
  }
}
