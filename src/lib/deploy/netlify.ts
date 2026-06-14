import "server-only";

/**
 * Netlify deploy adapter. Git-linked model: create a Netlify site pointed at
 * the user's GitHub repo so Netlify auto-builds on every push. Auth is a
 * personal access token (app.netlify.com/user/applications). The site requires
 * the Netlify GitHub app to have access to the repo.
 */

import type { DeployAuth, DeployProvider, DeployResult, DeployStatus, LinkedProject } from "./types";

const API = "https://api.netlify.com/api/v1";

function toSiteName(repo: string): string {
  const base = repo.split("/").pop() ?? repo;
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 63) || "helix-app"
  );
}

async function netlifyFetch(
  auth: DeployAuth,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

export const netlifyProvider: DeployProvider = {
  name: "netlify",
  label: "Netlify",
  implemented: true,
  supportedGitHosts: ["github", "gitlab", "bitbucket"],

  async linkRepo(auth, { repo, name, gitProvider }): Promise<DeployResult<LinkedProject>> {
    const siteName = name || toSiteName(repo);
    const res = await netlifyFetch(auth, `/sites`, {
      method: "POST",
      body: JSON.stringify({
        name: siteName,
        repo: { provider: gitProvider, repo, branch: "main", cmd: "", dir: "" },
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { error: "Netlify rejected the token — check it in Settings." };
      }
      const err = res.body as { message?: string; errors?: unknown } | null;
      const message = err?.message ?? `Netlify error ${res.status}`;
      const needsGithubAuth = /repo|github|permission|access|not found/i.test(message);
      return { error: message, needsGithubAuth };
    }
    const site = res.body as { id?: string; name?: string; ssl_url?: string; url?: string; admin_url?: string };
    return {
      projectId: site.id ?? "",
      projectName: site.name ?? siteName,
      productionUrl: site.ssl_url ?? site.url ?? `https://${siteName}.netlify.app`,
      dashboardUrl: site.admin_url ?? "https://app.netlify.com",
    };
  },

  async status(auth, { projectId }): Promise<DeployResult<DeployStatus>> {
    const res = await netlifyFetch(auth, `/sites/${encodeURIComponent(projectId)}/deploys?per_page=1`);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { error: "Netlify rejected the token." };
      return { error: `Netlify error ${res.status}` };
    }
    const deploys = res.body as { state?: string; deploy_ssl_url?: string; created_at?: string }[];
    const d = Array.isArray(deploys) ? deploys[0] : undefined;
    if (!d) return { state: "UNKNOWN" };
    return {
      state: normalizeState(d.state),
      url: d.deploy_ssl_url,
      updatedAt: d.created_at,
    };
  },
};

function normalizeState(s: string | undefined): DeployStatus["state"] {
  switch ((s ?? "").toLowerCase()) {
    case "ready":
      return "READY";
    case "building":
    case "uploading":
    case "uploaded":
    case "preparing":
    case "prepared":
    case "processing":
      return "BUILDING";
    case "new":
    case "enqueued":
    case "pending_review":
    case "accepted":
      return "QUEUED";
    case "error":
    case "rejected":
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}
