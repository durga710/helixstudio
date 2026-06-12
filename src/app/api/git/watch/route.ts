/**
 * /api/git/watch — auto-review opt-in for GitHub repos.
 *   GET    → the repos the user is watching
 *   POST   → { repo } install a pull_request webhook + record the watch
 *   DELETE → { repo } remove the webhook + the watch
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getGitAuth, withGitAuth, isValidRepoId } from "@/lib/git";
import { createWebhook, deleteWebhook } from "@/lib/git/github";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RepoSchema = z.object({ repo: z.string().min(3).max(200) });

function webhookUrl(req: Request): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return `${base.replace(/\/+$/, "")}/api/git/webhook`;
}

export async function GET() {
  const g = await guard("git.watch.read", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const watches = await db().repoWatch.findMany({
    where: { userId: g.user.id, provider: "github" },
    select: { repo: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return ok({ watches: watches.map((w) => ({ repo: w.repo })) });
}

export async function POST(req: Request) {
  const g = await guard("git.watch.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = RepoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const repo = parsed.data.repo.trim();
  if (!isValidRepoId("github", repo)) return apiErrors.badRequest('Repo must be "owner/name"');

  const auth = await getGitAuth(g.user.id, "github");
  if (!auth) return apiErrors.githubUnauthorized();

  const existing = await db().repoWatch.findUnique({ where: { provider_repo: { provider: "github", repo } } });
  if (existing && existing.userId !== g.user.id) {
    return apiErrors.conflict("Another account already watches this repo.");
  }

  const secret = randomBytes(24).toString("hex");
  const hook = await withGitAuth(auth, () => createWebhook(repo, { url: webhookUrl(req), secret }));
  if ("error" in hook) return apiErrors.badRequest(hook.error);

  await db().repoWatch.upsert({
    where: { provider_repo: { provider: "github", repo } },
    create: { userId: g.user.id, provider: "github", repo, secret, hookId: hook.hookId },
    update: { userId: g.user.id, secret, hookId: hook.hookId },
  });
  return ok({ repo, watching: true });
}

export async function DELETE(req: Request) {
  const g = await guard("git.watch.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = RepoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const repo = parsed.data.repo.trim();

  const watch = await db().repoWatch.findUnique({ where: { provider_repo: { provider: "github", repo } } });
  if (!watch || watch.userId !== g.user.id) return ok({ repo, watching: false });

  const auth = await getGitAuth(g.user.id, "github");
  if (auth && watch.hookId) await withGitAuth(auth, () => deleteWebhook(repo, watch.hookId!));
  await db().repoWatch.delete({ where: { id: watch.id } }).catch(() => {});
  return ok({ repo, watching: false });
}
