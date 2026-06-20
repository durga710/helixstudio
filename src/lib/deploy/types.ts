import "server-only";

/**
 * Deploy-provider abstraction — mirrors the git-provider layer. Every
 * platform (Vercel, Netlify, Cloudflare Pages, Render…) implements this one
 * interface, so the routes and UI never know which host they're talking to.
 * Adding a platform = one new adapter file, like adding a git host.
 */

export type DeployProviderName = "vercel" | "netlify" | "cloudflare" | "render";

/** The git hosts a platform's native git-link integration can build from. The
 * workspace's git provider must map to one of these for a one-click deploy. */
export type GitHostType = "github" | "gitlab" | "bitbucket";

/** Map a Helix git-provider name to the deploy platforms' git-host vocabulary,
 * or null when no platform can git-link it (e.g. self-hosted Gitea, Azure). */
export function gitHostFor(provider: string): GitHostType | null {
  switch (provider) {
    case "github":
      return "github";
    case "gitlab":
      return "gitlab";
    case "bitbucket":
      return "bitbucket";
    default:
      return null;
  }
}

/** A user's resolved credentials for a platform. `config` holds per-provider
 * extras (Vercel teamId, Cloudflare accountId, …). */
export interface DeployAuth {
  provider: DeployProviderName;
  token: string;
  config?: Record<string, unknown>;
}

/** The platform project a workspace is git-linked to. */
export interface LinkedProject {
  projectId: string;
  projectName: string;
  dashboardUrl?: string;
  productionUrl?: string;
}

export type DeployState = "READY" | "BUILDING" | "QUEUED" | "ERROR" | "CANCELED" | "UNKNOWN";

export interface DeployStatus {
  state: DeployState;
  url?: string; // the deployment's own URL
  productionUrl?: string;
  updatedAt?: string;
}

/** One recent deployment, for the monitoring / activity view. */
export interface DeployEvent {
  id: string;
  state: DeployState;
  createdAt?: string; // ISO
  url?: string;
  target?: string; // "production" | "preview" | …
}

/** Soft-fail result: ok-data or a user-facing message (+ optional action
 * hint, e.g. "install the platform's GitHub app"). */
export type DeployResult<T> = T | { error: string; needsGithubAuth?: boolean };

export interface DeployProvider {
  name: DeployProviderName;
  label: string;
  /** Whether this adapter is wired up yet (others are scaffolded). */
  implemented: boolean;
  /** Which git hosts this platform can git-link a repo from. */
  supportedGitHosts: GitHostType[];
  /**
   * Git-link a repo to a new (or existing) project on the platform so it
   * auto-builds on every push. `repo` is "owner/name"; `gitProvider` is the
   * host that repo lives on (must be one of `supportedGitHosts`).
   */
  linkRepo(
    auth: DeployAuth,
    opts: { repo: string; name: string; gitProvider: GitHostType },
  ): Promise<DeployResult<LinkedProject>>;
  /** Latest production deployment status for the linked project. */
  status(auth: DeployAuth, project: { projectId: string }): Promise<DeployResult<DeployStatus>>;
  /**
   * Recent deployments for the project (newest first) — the data behind the
   * "Monitor" view. Optional: a platform without it simply shows no history.
   */
  logs?(auth: DeployAuth, project: { projectId: string }): Promise<DeployResult<DeployEvent[]>>;
}
