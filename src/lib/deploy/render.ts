import "server-only";

/**
 * Render deploy adapter. Git-linked model: create a Render web service pointed
 * at the user's GitHub repo with autoDeploy on, so Render builds on every
 * push. Auth is an API key (dashboard.render.com → API Keys); the owner id
 * (config.ownerId — the Render user/team id) is required to create services.
 * Build/start commands default to a Node setup and can be tuned in Render.
 */

import type { DeployAuth, DeployProvider, DeployResult, DeployStatus, LinkedProject } from "./types";

const API = "https://api.render.com/v1";

function toServiceName(repo: string): string {
  const base = repo.split("/").pop() ?? repo;
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "helix-app"
  );
}

function ownerId(auth: DeployAuth): string {
  return typeof auth.config?.ownerId === "string" ? auth.config.ownerId : "";
}

async function renderFetch(
  auth: DeployAuth,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

export const renderProvider: DeployProvider = {
  name: "render",
  label: "Render",
  implemented: true,

  async linkRepo(auth, { repo, name }): Promise<DeployResult<LinkedProject>> {
    const owner = ownerId(auth);
    if (!owner) return { error: "Add your Render Owner ID in Settings → Deployments." };
    const serviceName = name || toServiceName(repo);
    const res = await renderFetch(auth, `/services`, {
      method: "POST",
      body: JSON.stringify({
        type: "web_service",
        name: serviceName,
        ownerId: owner,
        repo: `https://github.com/${repo}`,
        branch: "main",
        autoDeploy: "yes",
        serviceDetails: {
          env: "node",
          envSpecificDetails: {
            buildCommand: "npm install && npm run build",
            startCommand: "npm start",
          },
          plan: "free",
        },
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { error: "Render rejected the API key — check it in Settings." };
      }
      const err = res.body as { message?: string } | null;
      const message = err?.message ?? `Render error ${res.status}`;
      const needsGithubAuth = /github|repo|permission|access|connect/i.test(message);
      return { error: message, needsGithubAuth };
    }
    // Render returns { service: {...}, deployId } on create.
    const out = res.body as {
      service?: { id?: string; name?: string; serviceDetails?: { url?: string } };
    };
    const svc = out.service;
    return {
      projectId: svc?.id ?? "",
      projectName: svc?.name ?? serviceName,
      productionUrl: svc?.serviceDetails?.url ?? `https://${serviceName}.onrender.com`,
      dashboardUrl: "https://dashboard.render.com",
    };
  },

  async status(auth, { projectId }): Promise<DeployResult<DeployStatus>> {
    const res = await renderFetch(auth, `/services/${encodeURIComponent(projectId)}/deploys?limit=1`);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { error: "Render rejected the API key." };
      return { error: `Render error ${res.status}` };
    }
    // Render wraps each item as { deploy: {...}, cursor }.
    const list = res.body as { deploy?: { status?: string; finishedAt?: string; createdAt?: string } }[];
    const d = Array.isArray(list) ? list[0]?.deploy : undefined;
    if (!d) return { state: "UNKNOWN" };
    return {
      state: normalizeState(d.status),
      updatedAt: d.finishedAt ?? d.createdAt,
    };
  },
};

function normalizeState(s: string | undefined): DeployStatus["state"] {
  switch ((s ?? "").toLowerCase()) {
    case "live":
      return "READY";
    case "build_in_progress":
    case "update_in_progress":
    case "pre_deploy_in_progress":
      return "BUILDING";
    case "created":
    case "queued":
      return "QUEUED";
    case "build_failed":
    case "update_failed":
    case "pre_deploy_failed":
    case "deactivated":
      return "ERROR";
    case "canceled":
      return "CANCELED";
    default:
      return "UNKNOWN";
  }
}
