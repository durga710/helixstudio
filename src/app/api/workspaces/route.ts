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
import { isAdminEmail } from "@/lib/admin";
import { getTemplate } from "@/lib/templates/store";
import { buildTemplateNote, classifyPrompt, classifyGameTemplate } from "@/lib/templates/router";
import { templateForCategory, templateForEngine } from "@/lib/templates/engines";

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
    prompt: z.string().max(2000).optional(),
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
    // Optional template injection: seed the workspace's files + notes from a
    // pre-made starter (0 AI tokens). Invalid/absent templateId → empty
    // workspace (today's behavior, byte-for-byte).
    // Resolve the starter: an explicit templateId wins; otherwise classify the
    // prompt silently (the engine is hidden from the user — it just feels like
    // the AI chose the stack).
    let templateId = parsed.data.templateId;
    const promptText = parsed.data.prompt?.trim();
    const { buildKind, gameCategory, engineOverride, buildMode } = parsed.data;

    // Resolve the starter, highest precedence first (all 0-token):
    // 1) admin engine override → that engine's starter (silently ignored for
    //    non-admins so a forged body can't bypass routing);
    // 2) a chosen game category → its forced starter;
    // 3) a game with "My Own Idea" (or no category) → keyword game-classify;
    // 4) back-compat buildMode;
    // 5) otherwise (app) → the regular prompt classifier (today's behavior).
    if (!templateId && engineOverride && isAdminEmail(g.user.email)) {
      templateId = templateForEngine(engineOverride) ?? undefined;
    }
    if (!templateId && gameCategory) {
      templateId = templateForCategory(gameCategory) ?? undefined;
    }
    if (!templateId && buildKind === "game" && promptText) {
      // "My Own Idea" (category resolved to null) or game with no category.
      try {
        templateId = await classifyGameTemplate(promptText);
      } catch {
        templateId = "game-2d";
      }
    }
    if (!templateId) {
      if (buildMode === "game2d") templateId = "game-2d";
      else if (buildMode === "game3d") templateId = "game-3d";
    }
    if (!templateId && buildKind !== "game" && promptText) {
      try {
        templateId = (await classifyPrompt(promptText, g.user.id)).templateId;
      } catch {
        // classifier unavailable → blank workspace (today's behavior).
      }
    }
    // Premium upgrade: paid users get the premium, themeable skeleton for the
    // chosen framework; guests/free get the clean basic one (a deliberate upsell).
    const PREMIUM_VARIANT: Record<string, string> = {
      "static-web": "static-premium",
      "game-2d": "game-2d-premium",
      "game-3d": "game-3d-premium",
      "game-3d-pc": "game-3d-premium",
    };
    if (templateId && PREMIUM_VARIANT[templateId]) {
      const u = await db().user.findUnique({ where: { id: g.user.id }, select: { tier: true, isGuest: true } });
      const premium = isAdminEmail(g.user.email) || (!u?.isGuest && (u?.tier === "pro" || u?.tier === "team"));
      if (premium) templateId = PREMIUM_VARIANT[templateId];
    }

    const tpl = templateId ? await getTemplate(templateId) : undefined;
    const ws = await db().workspace.create({
      data: {
        userId: g.user.id,
        name: parsed.data.name?.trim() || "Untitled project",
        mode: "SCRATCH",
        kind: buildKind === "game" ? "game" : "app",
        ...(tpl && {
          notes: buildTemplateNote(tpl),
          files: { create: tpl.files.map((f) => ({ path: f.path, content: f.content })) },
        }),
      },
    });
    return ok({ id: ws.id, templateId: tpl?.manifest.id });
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
