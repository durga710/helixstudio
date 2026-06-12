/**
 * /api/workspaces
 *   GET  → list the user's workspaces (newest first)
 *   POST → create one: { mode: "SCRATCH", name? } |
 *                      { mode: "IMPORT", repo, branch? }
 *          IMPORT validates the repo is reachable with the user's GitHub
 *          token and pins the base branch.
 */

import { z } from "zod";
import { db } from "@/lib/db";
import { ok, apiErrors } from "@/lib/api-response";
import { getProvider, getGitAuth, withGitAuth, isValidRepoId, PROVIDER_META } from "@/lib/git";
import { isValidBranchName } from "@/lib/repo-files";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderSchema = z.enum(["github", "gitlab", "bitbucket", "azure", "gitea"]).default("github");

const CreateSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("SCRATCH"),
    name: z.string().min(1).max(80).optional(),
  }),
  z.object({
    mode: z.literal("IMPORT"),
    repo: z.string().min(3).max(300),
    branch: z.string().max(80).optional(),
    provider: ProviderSchema,
  }),
]);

export async function GET() {
  const g = await guard("ws.read", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const workspaces = await db().workspace.findMany({
    where: { userId: g.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      mode: true,
      provider: true,
      repo: true,
      baseBranch: true,
      updatedAt: true,
      _count: { select: { files: true, messages: true } },
    },
    take: 50,
  });
  return ok({ workspaces });
}

export async function POST(req: Request) {
  const g = await guard("ws.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  if (parsed.data.mode === "SCRATCH") {
    const ws = await db().workspace.create({
      data: {
        userId: g.user.id,
        name: parsed.data.name?.trim() || "Untitled project",
        mode: "SCRATCH",
      },
    });
    return ok({ id: ws.id });
  }

  // IMPORT — verify access on the chosen git host and pin the branch.
  const { provider, branch } = parsed.data;
  const meta = PROVIDER_META[provider];
  const repo = parsed.data.repo.trim();
  if (!isValidRepoId(provider, repo)) {
    return apiErrors.badRequest(`Repo must look like "${meta.repoIdHint}"`);
  }
  if (branch && !isValidBranchName(branch)) {
    return apiErrors.badRequest("Invalid branch name");
  }

  const auth = await getGitAuth(g.user.id, provider);
  if (!auth) return apiErrors.githubUnauthorized();

  const tree = await withGitAuth(auth, () => getProvider(provider).fetchRepoTree(repo, branch));
  if (!tree) {
    return apiErrors.badRequest(
      `Couldn't read ${repo} — check the repo name, or reconnect ${meta.label} if it's private.`,
    );
  }

  const ws = await db().workspace.create({
    data: {
      userId: g.user.id,
      name: repo.split("/").pop() ?? repo,
      mode: "IMPORT",
      provider,
      repo,
      baseBranch: tree.branch,
    },
  });
  return ok({ id: ws.id });
}
