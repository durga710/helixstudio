/**
 * /api/workspaces/[id]/deploy
 *   POST   → git-link the workspace's repo to a platform (Vercel…) so it
 *            auto-deploys on every push. Body: { provider }.
 *   GET    → the workspace's linked project + a fresh live status.
 *   DELETE → unlink (stops Helix tracking it; the platform project stays).
 *
 * Git-linked model: the workspace must already be pushed to a GitHub repo
 * (ws.repo set, provider github). After linking, the platform builds on push.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guardWorkspace } from "@/lib/route-helpers";
import { getDeployAuth, getDeployProvider } from "@/lib/deploy";
import { gitHostFor } from "@/lib/deploy/types";
import { PROVIDER_META } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

const PostSchema = z.object({ provider: z.string() });

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("deploy.link", id, { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const provider = getDeployProvider(parsed.data.provider);
  if (!provider) return apiErrors.badRequest("Unknown platform.");
  if (!provider.implemented) return apiErrors.badRequest(`${provider.label} deploys are coming soon.`);

  // Git-linked deploys need a pushed repo on a host the platform can build from.
  const hostLabel = PROVIDER_META[ws.provider as keyof typeof PROVIDER_META]?.label ?? ws.provider;
  if (!ws.repo) {
    return apiErrors.badRequest("Push this workspace to a git repo first, then deploy.");
  }
  const gitHost = gitHostFor(ws.provider);
  if (!gitHost) {
    return apiErrors.badRequest(
      `${provider.label} can't deploy from ${hostLabel}. Push to GitHub, GitLab, or Bitbucket to deploy.`,
    );
  }
  if (!provider.supportedGitHosts.includes(gitHost)) {
    const supported = provider.supportedGitHosts
      .map((h) => h.charAt(0).toUpperCase() + h.slice(1))
      .join(", ");
    return apiErrors.badRequest(
      `${provider.label} can't deploy from ${hostLabel} — it supports ${supported}. Push there, or pick a different platform.`,
    );
  }

  const auth = await getDeployAuth(user.id, provider.name);
  if (!auth) {
    return apiErrors.badRequest(`Connect ${provider.label} in Settings → Deployments first.`);
  }

  const result = await provider.linkRepo(auth, { repo: ws.repo, name: "", gitProvider: gitHost });
  if ("error" in result) {
    return apiErrors.badRequest(
      result.needsGithubAuth
        ? `${provider.label} needs access to your GitHub repo. Install the ${provider.label} GitHub app for ${ws.repo}, then try again. (${result.error})`
        : result.error,
    );
  }

  const saved = await db().workspaceDeploy.upsert({
    where: { workspaceId: ws.id },
    create: {
      workspaceId: ws.id,
      provider: provider.name,
      projectId: result.projectId,
      projectName: result.projectName,
      dashboardUrl: result.dashboardUrl,
      productionUrl: result.productionUrl,
      lastState: "QUEUED",
    },
    update: {
      provider: provider.name,
      projectId: result.projectId,
      projectName: result.projectName,
      dashboardUrl: result.dashboardUrl,
      productionUrl: result.productionUrl,
    },
  });

  return ok({
    provider: provider.name,
    projectName: saved.projectName,
    dashboardUrl: saved.dashboardUrl,
    productionUrl: saved.productionUrl,
  });
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("deploy.read", id, { limit: 600, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  const link = await db().workspaceDeploy.findUnique({ where: { workspaceId: g.ws.id } });
  if (!link) return ok({ linked: false });

  // Refresh live status (best-effort; falls back to the stored state).
  let state = link.lastState ?? "UNKNOWN";
  let deploymentUrl: string | undefined;
  const provider = getDeployProvider(link.provider);
  const auth = g.isOwner ? await getDeployAuth(g.user.id, link.provider) : null;
  if (provider && auth) {
    const status = await provider.status(auth, { projectId: link.projectId });
    if (!("error" in status)) {
      state = status.state;
      deploymentUrl = status.url;
      // Only bump lastDeployAt when the state actually changed — otherwise a
      // routine status poll (e.g. opening the dialog) would overwrite the real
      // "last deployed" time with "now".
      const stateChanged = state !== link.lastState;
      await db()
        .workspaceDeploy.update({
          where: { workspaceId: g.ws.id },
          data: { lastState: state, ...(stateChanged ? { lastDeployAt: new Date() } : {}) },
        })
        .catch(() => {});
    }
  }

  return ok({
    linked: true,
    provider: link.provider,
    projectName: link.projectName,
    dashboardUrl: link.dashboardUrl,
    productionUrl: link.productionUrl,
    deploymentUrl,
    state,
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("deploy.link", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  await db().workspaceDeploy.deleteMany({ where: { workspaceId: g.ws.id } });
  return ok({ unlinked: true });
}
