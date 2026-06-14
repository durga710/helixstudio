import "server-only";

/**
 * Cloudflare Pages deploy adapter. Git-linked model: create a Pages project
 * pointed at the user's GitHub repo so Cloudflare auto-builds on every push.
 * Auth is an API token with the Pages:Edit permission; the account id is
 * required (config.accountId) since Pages projects are account-scoped.
 */

import type { DeployAuth, DeployProvider, DeployResult, DeployStatus, LinkedProject } from "./types";

const API = "https://api.cloudflare.com/client/v4";

function toProjectName(repo: string): string {
  const base = repo.split("/").pop() ?? repo;
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 58) || "helix-app"
  );
}

function accountId(auth: DeployAuth): string {
  return typeof auth.config?.accountId === "string" ? auth.config.accountId : "";
}

async function cfFetch(
  auth: DeployAuth,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: { success?: boolean; result?: unknown; errors?: { message?: string }[] } | null }> {
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
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    result?: unknown;
    errors?: { message?: string }[];
  } | null;
  return { ok: res.ok && body?.success !== false, status: res.status, body };
}

export const cloudflareProvider: DeployProvider = {
  name: "cloudflare",
  label: "Cloudflare Pages",
  implemented: true,
  supportedGitHosts: ["github", "gitlab"],

  async linkRepo(auth, { repo, name, gitProvider }): Promise<DeployResult<LinkedProject>> {
    const acct = accountId(auth);
    if (!acct) return { error: "Add your Cloudflare Account ID in Settings → Deployments." };
    const projectName = name || toProjectName(repo);
    const [owner, repoName] = repo.split("/");
    const res = await cfFetch(auth, `/accounts/${acct}/pages/projects`, {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        production_branch: "main",
        source: {
          type: gitProvider,
          config: { owner, repo_name: repoName, production_branch: "main", deployments_enabled: true },
        },
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { error: "Cloudflare rejected the token — check it (needs Pages:Edit) in Settings." };
      }
      const message = res.body?.errors?.[0]?.message ?? `Cloudflare error ${res.status}`;
      const needsGithubAuth = /github|repo|permission|access|install/i.test(message);
      return { error: message, needsGithubAuth };
    }
    const p = res.body?.result as { name?: string; subdomain?: string } | undefined;
    const finalName = p?.name ?? projectName;
    return {
      // Cloudflare addresses projects by name in subsequent calls.
      projectId: finalName,
      projectName: finalName,
      productionUrl: p?.subdomain ? `https://${p.subdomain}` : `https://${finalName}.pages.dev`,
      dashboardUrl: "https://dash.cloudflare.com",
    };
  },

  async status(auth, { projectId }): Promise<DeployResult<DeployStatus>> {
    const acct = accountId(auth);
    if (!acct) return { error: "No Cloudflare Account ID configured." };
    const res = await cfFetch(
      auth,
      `/accounts/${acct}/pages/projects/${encodeURIComponent(projectId)}/deployments?per_page=1`,
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { error: "Cloudflare rejected the token." };
      return { error: res.body?.errors?.[0]?.message ?? `Cloudflare error ${res.status}` };
    }
    const list = res.body?.result as
      | { latest_stage?: { status?: string }; url?: string; created_on?: string }[]
      | undefined;
    const d = Array.isArray(list) ? list[0] : undefined;
    if (!d) return { state: "UNKNOWN" };
    return {
      state: normalizeState(d.latest_stage?.status),
      url: d.url,
      updatedAt: d.created_on,
    };
  },
};

function normalizeState(s: string | undefined): DeployStatus["state"] {
  switch ((s ?? "").toLowerCase()) {
    case "success":
      return "READY";
    case "active":
    case "running":
      return "BUILDING";
    case "idle":
    case "queued":
      return "QUEUED";
    case "failure":
      return "ERROR";
    case "canceled":
      return "CANCELED";
    default:
      return "UNKNOWN";
  }
}
