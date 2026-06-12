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
import { getProvider, getGitAuth, withGitAuth, PROVIDER_META } from "@/lib/git";
import { getOverlay } from "@/lib/workspace";
import { isValidBranchName, validateFiles, MAX_PUSH_FILES } from "@/lib/repo-files";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  }),
  z.object({
    target: z.literal("repo"),
    branch: z.string().max(80).optional(),
    message: z.string().max(200).optional(),
    prTitle: z.string().max(200).optional(),
    prBody: z.string().max(4000).optional(),
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

  return withGitAuth(auth, async () => {
    if (data.target === "new-repo") {
      const created = await git.createRepo(data.name, { isPrivate: data.private ?? false });
      if ("error" in created) return apiErrors.badRequest(created.error);

      const pushed = await git.pushFilesToRepo(created.repo, {
        branch: created.defaultBranch,
        message: data.message?.trim() || `Helix: ${ws.name}`,
        files: overlay.files,
        // a brand-new repo has nothing to delete
      });
      if ("error" in pushed) return apiErrors.badRequest(pushed.error);

      await db().workspace.update({
        where: { id: ws.id },
        data: { repo: created.repo, baseBranch: created.defaultBranch },
      });

      return ok({
        repo: created.repo,
        repoUrl: created.url,
        branch: pushed.branch,
        commitUrl: pushed.commitUrl,
      });
    }

    // target === "repo"
    const repo = ws.repo;
    if (!repo) {
      return apiErrors.badRequest(
        "This workspace has no repo yet — push to a new repo first (or import one).",
      );
    }

    const branch = data.branch?.trim() || `helix/${ws.id.slice(-6)}-${Date.now().toString(36)}`;
    if (!isValidBranchName(branch)) return apiErrors.badRequest("Invalid branch name");

    const pushed = await git.pushFilesToRepo(repo, {
      branch,
      message: data.message?.trim() || `Helix: update ${ws.name}`,
      files: overlay.files,
      deletions: overlay.deletions,
    });
    if ("error" in pushed) return apiErrors.badRequest(pushed.error);

    let prUrl: string | null = null;
    let prError: string | null = null;
    if (data.prTitle?.trim()) {
      if (pushed.branch !== branch) {
        // Empty repo: the push bootstrapped the root commit directly on the
        // default branch, so there is no diff to open a PR against.
        prError = `The repo was empty, so the first commit went straight to ${pushed.branch} — no ${meta.prNoun} needed.`;
      } else {
        const pr = await git.createPullRequest(repo, {
          title: data.prTitle.trim(),
          body: data.prBody?.trim() || data.prTitle.trim(),
          head: branch,
        });
        if ("url" in pr) prUrl = pr.url;
        else prError = pr.error;
      }
    }

    return ok({ repo, branch: pushed.branch, commitUrl: pushed.commitUrl, prUrl, prError });
  });
}
