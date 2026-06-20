/**
 * /api/workspaces
 *   GET  → list the user's workspaces (newest first)
 *   POST → create one: { mode: "SCRATCH", name? } |
 *                      { mode: "IMPORT", repo, branch? }
 *          IMPORT validates the repo is reachable with the user's GitHub
 *          token and pins the base branch.
 */

import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, apiErrors } from "@/lib/api-response";
import { getProvider, getGitAuth, withGitAuth, isValidRepoId, PROVIDER_META } from "@/lib/git";
import { isValidBranchName } from "@/lib/repo-files";
import { guard } from "@/lib/route-helpers";
import { prewarmWorkspaceEmbeddings } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderSchema = z.enum(["github", "gitlab", "bitbucket", "azure", "gitea"]).default("github");

const CreateSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("SCRATCH"),
    name: z.string().min(1).max(80).optional(),
    // Optional explicit starter template (0-token file injection).
    templateId: z.string().min(1).max(64).optional(),
    // The user's idea. When present (and no explicit templateId), the server
    // silently picks the best starter and injects it — the picker is invisible.
    // The editor also stashes the full idea client-side (sessionStorage), so an
    // ambitious whole-app brief — however long — must NEVER be rejected at
    // creation (that strands the user with no workspace). Very high ceiling; the
    // client clamps what it sends and the full spec is persisted later by /plan.
    prompt: z.string().max(100_000).optional(),
    // The Game Agent's hidden routing (all 0-token). buildKind splits app vs
    // game; gameCategory is the kid-facing card (forces its starter); the engine
    // is never shown — students pick a category, we pick the engine.
    buildKind: z.enum(["app", "game"]).optional(),
    gameCategory: z.string().max(40).optional(),
    // Admin/tester-only escape hatch: force a specific engine. Ignored unless
    // the caller is an admin (so a forged body can't bypass routing).
    engineOverride: z.string().max(40).optional(),
    // Back-compat with the previous selector ("game2d"/"game3d" force a starter).
    buildMode: z.enum(["web", "game2d", "game3d"]).optional(),
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
      kind: true,
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
    // NO template is seeded at creation — the editor opens empty and mode-specific.
    // The starter is injected on the FIRST chat turn (agent-turn.ts), once the user
    // says what they want, so we never preload a generic app/game into a fresh
    // project. We persist the picked sub-type (game category) so that first-turn
    // injection picks the right starter and the chat shows mode-specific suggestions
    // — without rendering anything before the user has decided.
    const { buildKind, gameCategory } = parsed.data;
    const wsName = parsed.data.name?.trim() || "Untitled project";
    const ws = await db().workspace.create({
      data: {
        userId: g.user.id,
        name: wsName,
        mode: "SCRATCH",
        kind: buildKind === "game" ? "game" : "app",
        ...(gameCategory ? { gameCategory } : {}),
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
  // Index the whole repo for semantic search in the background — "every file
  // embedded the moment you connect." Best-effort + key-gated; if it can't run,
  // search falls back to lazy on-demand embedding (then BM25 with no key).
  after(prewarmWorkspaceEmbeddings(ws, g.user.id).then(() => {}, () => {}));
  return ok({ id: ws.id });
}
