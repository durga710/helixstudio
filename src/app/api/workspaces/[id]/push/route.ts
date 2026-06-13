/**
 * /api/workspaces/[id]/push — POST: ship the overlay to GitHub.
 *
 *   { target: "new-repo", name, private?, message? }
 *       → create a repo on the user's account, push everything to its
 *         default branch, remember the repo on the workspace.
 *   { target: "repo", message?, branch?, prTitle?, prBody? }
 *       → push to the workspace's repo (IMPORT repo or the repo created by a
 *         previous push). Default: a new helix/* branch + optional PR.
 *         branch may name the base branch directly to push without a PR.
 */

import { z } from "zod";
import { db } from "@/lib/db";
import { ok, apiErrors } from "@/lib/api-response";
import { getProvider, getGitAuth, withGitAuth, PROVIDER_META, type GitAuth } from "@/lib/git";
import { getOverlay } from "@/lib/workspace";
import { usingSandboxBackend } from "@/lib/app-runner";
import { gitPush } from "@/lib/runner/git-push";
import { isValidBranchName, validateFiles, MAX_PUSH_FILES } from "@/lib/repo-files";
import { scanFiles } from "@/lib/security/secret-scan";
import { guardWorkspace } from "@/lib/route-helpers";
import { recordSpaceEvent, actorNameOf } from "@/lib/space-events";
import type { Workspace } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Pushed {
  branch: string;
  commitSha?: string;
  commitUrl: string;
}

/**
 * Ship the overlay to a repo. In production/self-host (sandbox runner) this is
 * REAL git inside the VM — clone, commit, rebase onto the latest base (so an
 * upstream move doesn't clobber, and a true conflict fails safe), push. In
 * local dev (no sandbox) it falls back to the REST adapter's single-commit push.
 */
async function shipOverlay(
  ws: Workspace,
  auth: GitAuth,
  repo: string,
  o: { branch: string; baseBranch: string; message: string; files: { path: string; content: string }[]; deletions: string[] },
): Promise<Pushed | { error: string; conflict?: boolean }> {
  if (usingSandboxBackend()) {
    return gitPush(ws, auth, { repo, ...o });
  }
  const provider = getProvider(auth.provider);
  return withGitAuth(auth, () =>
    provider.pushFilesToRepo(repo, { branch: o.branch, message: o.message, files: o.files, deletions: o.deletions }),
  );
}

const PushSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("new-repo"),
    name: z
      .string()
      .min(1)
      .max(90)
      .regex(/^[a-z0-9][a-z0-9-_.]*$/i, "kebab-case repo name"),
    private: z.boolean().optional(),
    message: z.string().max(200).optional(),
    // Override the secret-scan block (set after the user reviews the findings).
    allowSecrets: z.boolean().optional(),
  }),
  z.object({
    target: z.literal("repo"),
    branch: z.string().max(80).optional(),
    message: z.string().max(200).optional(),
    prTitle: z.string().max(200).optional(),
    prBody: z.string().max(4000).optional(),
    allowSecrets: z.boolean().optional(),
  }),
]);

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("push", id, { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = PushSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const git = getProvider(ws.provider);
  const meta = PROVIDER_META[git.name];
  const auth = await getGitAuth(user.id, ws.provider);
  if (!auth) return apiErrors.githubUnauthorized();

  const overlay = await getOverlay(ws);
  if (overlay.files.length === 0 && overlay.deletions.length === 0) {
    return apiErrors.badRequest("Nothing to push — no changed files in this workspace.");
  }
  if (overlay.files.length > 0) {
    const check = validateFiles(overlay.files, MAX_PUSH_FILES);
    if (!check.ok) return apiErrors.badRequest(check.error);
  }

  const data = parsed.data;

  // Secret scan: block a push that looks like it contains hardcoded credentials,
  // unless the user reviewed the findings and explicitly overrode (allowSecrets).
  if (!data.allowSecrets && overlay.files.length > 0) {
    const secrets = scanFiles(overlay.files);
    if (secrets.length > 0) return ok({ secretsBlocked: true, secrets: secrets.slice(0, 25) });
  }

  if (data.target === "new-repo") {
    const created = await withGitAuth(auth, () => git.createRepo(data.name, { isPrivate: data.private ?? false }));
    if ("error" in created) return apiErrors.badRequest(created.error);

    const pushed = await shipOverlay(ws, auth, created.repo, {
      branch: created.defaultBranch,
      baseBranch: created.defaultBranch,
      message: data.message?.trim() || `Helix: ${ws.name}`,
      files: overlay.files,
      deletions: [], // a brand-new repo has nothing to delete
    });
    if ("error" in pushed) return apiErrors.badRequest(pushed.error);

    await db().workspace.update({
      where: { id: ws.id },
      data: { repo: created.repo, baseBranch: created.defaultBranch },
    });

    if (ws.spaceId) {
      void recordSpaceEvent({
        spaceId: ws.spaceId,
        userId: g.user.id,
        actorName: actorNameOf(g.user),
        action: "pushed",
        target: ws.name,
        targetId: ws.id,
      });
    }
    return ok({ repo: created.repo, repoUrl: created.url, branch: pushed.branch, commitUrl: pushed.commitUrl });
  }

  // target === "repo"
  const repo = ws.repo;
  if (!repo) {
    return apiErrors.badRequest("This workspace has no repo yet — push to a new repo first (or import one).");
  }
  const baseBranch = ws.baseBranch || "main";
  const branch = data.branch?.trim() || `helix/${ws.id.slice(-6)}-${Date.now().toString(36)}`;
  if (!isValidBranchName(branch)) return apiErrors.badRequest("Invalid branch name");

  const pushed = await shipOverlay(ws, auth, repo, {
    branch,
    baseBranch,
    message: data.message?.trim() || `Helix: update ${ws.name}`,
    files: overlay.files,
    deletions: overlay.deletions,
  });
  if ("error" in pushed) {
    return apiErrors.badRequest(pushed.error);
  }

  let prUrl: string | null = null;
  let prError: string | null = null;
  if (data.prTitle?.trim()) {
    if (pushed.branch !== branch) {
      // Empty repo: the first commit went straight to the default branch, so
      // there is no diff to open a PR against.
      prError = `The repo was empty, so the first commit went straight to ${pushed.branch} — no ${meta.prNoun} needed.`;
    } else {
      const pr = await withGitAuth(auth, () =>
        git.createPullRequest(repo, {
          title: data.prTitle!.trim(),
          body: data.prBody?.trim() || data.prTitle!.trim(),
          head: branch,
        }),
      );
      if ("url" in pr) prUrl = pr.url;
      else prError = pr.error;
    }
  }

  if (ws.spaceId) {
    void recordSpaceEvent({
      spaceId: ws.spaceId,
      userId: g.user.id,
      actorName: actorNameOf(g.user),
      action: "pushed",
      target: ws.name,
      targetId: ws.id,
    });
  }
  return ok({ repo, branch: pushed.branch, commitUrl: pushed.commitUrl, prUrl, prError });
}
