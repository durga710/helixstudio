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
import { getTemplate } from "@/lib/templates/store";
import { buildTemplateNote, classifyPrompt } from "@/lib/templates/router";

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
    // Optional template injection: seed the workspace's files + notes from a
    // pre-made starter (0 AI tokens). Invalid/absent templateId → empty
    // workspace (today's behavior, byte-for-byte).
    // Resolve the starter: an explicit templateId wins; otherwise classify the
    // prompt silently (the engine is hidden from the user — it just feels like
    // the AI chose the stack).
    let templateId = parsed.data.templateId;
    if (!templateId && parsed.data.prompt?.trim()) {
      try {
        templateId = (await classifyPrompt(parsed.data.prompt.trim(), g.user.id)).templateId;
      } catch {
        // classifier unavailable → blank workspace (today's behavior).
      }
    }
    const tpl = templateId ? await getTemplate(templateId) : undefined;
    const ws = await db().workspace.create({
      data: {
        userId: g.user.id,
        name: parsed.data.name?.trim() || "Untitled project",
        mode: "SCRATCH",
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
