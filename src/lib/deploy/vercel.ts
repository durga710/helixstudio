import "server-only";

/**
 * Vercel deploy adapter. Git-linked model: create a Vercel project pointed at
 * the user's GitHub repo, and Vercel auto-builds on every push (the workspace
 * already pushes to that repo). All Vercel-specific HTTP lives here.
 *
 * Auth: a personal Vercel access token (vercel.com/account/tokens). Team
 * accounts pass a teamId in config. We never store anything but the token +
 * teamId.
 */

import type { DeployAuth, DeployEvent, DeployProvider, DeployResult, DeployStatus, LinkedProject } from "./types";

const API = "https://api.vercel.com";

/** Vercel project names: lowercase, alphanumeric + hyphens, ≤100 chars. */
function toProjectName(repo: string): string {
  const base = repo.split("/").pop() ?? repo;
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "helix-app"
  );
}

function teamQuery(auth: DeployAuth): string {
  const teamId = typeof auth.config?.teamId === "string" ? auth.config.teamId : "";
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function vercelFetch(
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

export const vercelProvider: DeployProvider = {
  name: "vercel",
  label: "Vercel",
  implemented: true,
  supportedGitHosts: ["github", "gitlab", "bitbucket"],

  async linkRepo(auth, { repo, name, gitProvider }): Promise<DeployResult<LinkedProject>> {
    const projectName = name || toProjectName(repo);
    // Create a project linked to the repo — this turns on Vercel's native
    // auto-deploy-on-push. `type` selects the git host (github/gitlab/bitbucket).
    const create = await vercelFetch(auth, `/v10/projects${teamQuery(auth)}`, {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        gitRepository: { type: gitProvider, repo },
        framework: null, // Vercel auto-detects (Next.js, Vite, etc.)
      }),
    });

    if (!create.ok) {
      const err = create.body as { error?: { code?: string; message?: string } } | null;
      const code = err?.error?.code ?? "";
      const message = err?.error?.message ?? `Vercel error ${create.status}`;
      // The most common real-world failure: the user's Vercel account hasn't
      // installed the GitHub app / authorized the repo.
      const needsGithubAuth =
        /github/i.test(message) && /(install|connect|permission|not found|access)/i.test(message);
      if (create.status === 401 || create.status === 403) {
        return { error: "Vercel rejected the token — check it in Settings.", needsGithubAuth: false };
      }
      // A name clash usually means the project already exists for this user.
      if (code === "conflict" || /already exists/i.test(message)) {
        const existing = await vercelFetch(auth, `/v9/projects/${projectName}${teamQuery(auth)}`);
        if (existing.ok) {
          const p = existing.body as { id?: string; name?: string };
          return projectFrom(auth, p.id ?? "", p.name ?? projectName);
        }
      }
      return { error: message, needsGithubAuth };
    }

    const p = create.body as { id?: string; name?: string };
    return projectFrom(auth, p.id ?? "", p.name ?? projectName);
  },

  async status(auth, { projectId }): Promise<DeployResult<DeployStatus>> {
    const res = await vercelFetch(
      auth,
      `/v6/deployments${teamQuery(auth) ? teamQuery(auth) + "&" : "?"}projectId=${encodeURIComponent(projectId)}&limit=1&target=production`,
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { error: "Vercel rejected the token." };
      return { error: `Vercel error ${res.status}` };
    }
    const body = res.body as { deployments?: { state?: string; readyState?: string; url?: string; created?: number }[] };
    const d = body.deployments?.[0];
    if (!d) return { state: "UNKNOWN" };
    return {
      state: normalizeState(d.state ?? d.readyState),
      url: d.url ? `https://${d.url}` : undefined,
      updatedAt: d.created ? new Date(d.created).toISOString() : undefined,
    };
  },

  async logs(auth, { projectId }): Promise<DeployResult<DeployEvent[]>> {
    const res = await vercelFetch(
      auth,
      `/v6/deployments${teamQuery(auth) ? teamQuery(auth) + "&" : "?"}projectId=${encodeURIComponent(projectId)}&limit=10`,
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { error: "Vercel rejected the token." };
      return { error: `Vercel error ${res.status}` };
    }
    const body = res.body as {
      deployments?: { uid?: string; state?: string; readyState?: string; url?: string; created?: number; target?: string }[];
    };
    const events: DeployEvent[] = (body.deployments ?? []).map((d, i) => ({
      id: d.uid ?? `dep-${i}`,
      state: normalizeState(d.state ?? d.readyState),
      url: d.url ? `https://${d.url}` : undefined,
      createdAt: d.created ? new Date(d.created).toISOString() : undefined,
      target: d.target ?? "production",
    }));
    return events;
  },
};

function projectFrom(auth: DeployAuth, projectId: string, projectName: string): LinkedProject {
  const teamId = typeof auth.config?.teamId === "string" ? auth.config.teamId : "";
  return {
    projectId,
    projectName,
    // Dashboard URL needs the owner slug we don't always have; the project
    // page resolves from the name for personal accounts.
    dashboardUrl: teamId ? undefined : `https://vercel.com/dashboard`,
    productionUrl: `https://${projectName}.vercel.app`,
  };
}

function normalizeState(s: string | undefined): DeployStatus["state"] {
  switch ((s ?? "").toUpperCase()) {
    case "READY":
      return "READY";
    case "BUILDING":
    case "INITIALIZING":
      return "BUILDING";
    case "QUEUED":
      return "QUEUED";
    case "ERROR":
      return "ERROR";
    case "CANCELED":
      return "CANCELED";
    default:
      return "UNKNOWN";
  }
}
