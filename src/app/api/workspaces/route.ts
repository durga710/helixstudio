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
import { getGitHubToken } from "@/lib/auth";
import { fetchRepoTree, withGitHubToken } from "@/lib/github";
import { isValidRepoName, isValidBranchName } from "@/lib/repo-files";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("SCRATCH"),
    name: z.string().min(1).max(80).optional(),
  }),
  z.object({
    mode: z.literal("IMPORT"),
    repo: z.string().min(3).max(140),
    branch: z.string().max(80).optional(),
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

  // IMPORT — verify access and pin the branch.
  const repo = parsed.data.repo.trim();
  if (!isValidRepoName(repo)) return apiErrors.badRequest('Repo must be "owner/name"');
  if (parsed.data.branch && !isValidBranchName(parsed.data.branch)) {
    return apiErrors.badRequest("Invalid branch name");
  }

  const token = await getGitHubToken(g.user.id);
  if (!token) return apiErrors.githubUnauthorized();

  const tree = await withGitHubToken(token, () => fetchRepoTree(repo, parsed.data.mode === "IMPORT" ? parsed.data.branch : undefined));
  if (!tree) {
    return apiErrors.badRequest(
      `Couldn't read ${repo} — check the repo name, or reconnect GitHub if it's private.`,
    );
  }

  const ws = await db().workspace.create({
    data: {
      userId: g.user.id,
      name: repo.split("/")[1] ?? repo,
      mode: "IMPORT",
      repo,
      baseBranch: tree.branch,
    },
  });
  return ok({ id: ws.id });
}
