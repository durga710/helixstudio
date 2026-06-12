import "server-only";

/**
 * Deploy-provider abstraction — mirrors the git-provider layer. Every
 * platform (Vercel, Netlify, Cloudflare Pages, Render…) implements this one
 * interface, so the routes and UI never know which host they're talking to.
 * Adding a platform = one new adapter file, like adding a git host.
 */

export type DeployProviderName = "vercel" | "netlify" | "cloudflare" | "render";

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

/** Soft-fail result: ok-data or a user-facing message (+ optional action
 * hint, e.g. "install the platform's GitHub app"). */
export type DeployResult<T> = T | { error: string; needsGithubAuth?: boolean };

export interface DeployProvider {
  name: DeployProviderName;
  label: string;
  /** Whether this adapter is wired up yet (others are scaffolded). */
  implemented: boolean;
  /**
   * Git-link a GitHub repo to a new (or existing) project on the platform so
   * it auto-builds on every push. `repo` is "owner/name".
   */
  linkRepo(auth: DeployAuth, opts: { repo: string; name: string }): Promise<DeployResult<LinkedProject>>;
  /** Latest production deployment status for the linked project. */
  status(auth: DeployAuth, project: { projectId: string }): Promise<DeployResult<DeployStatus>>;
}
