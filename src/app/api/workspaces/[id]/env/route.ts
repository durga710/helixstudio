/**
 * /api/workspaces/[id]/env — the cloud environment (setup script + cache).
 *   GET   → effective setup script, whether it's custom, cache status
 *   PATCH → { setupScript } set/clear the override (clears the cache)
 *   POST  → { action: "rebuild" } drop the cached snapshot (next run rebuilds)
 */

import { z } from "zod";
import type { Workspace } from "@/generated/prisma/client";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import { detectFramework, defaultSetupScript } from "@/lib/runner/types";
import { clearEnvCache } from "@/lib/runner/vercel-sandbox";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({ setupScript: z.string().max(2000) });

type Params = { params: Promise<{ id: string }> };

/** Custom override if set, else the stack default derived from the files. */
async function effectiveSetup(ws: Workspace, userId: string): Promise<string | null> {
  const custom = ws.setupScript?.trim();
  if (custom) return custom;
  const gitAuth = ws.mode === "IMPORT" ? await getGitAuth(userId, ws.provider) : null;
  const files = await withGitAuth(gitAuth, () => listWorkspaceFiles(ws)).catch(() => []);
  const paths = files.map((f) => f.path);
  const pkgJson = paths.includes("package.json")
    ? await withGitAuth(gitAuth, () => readWorkspaceFile(ws, "package.json")).catch(() => null)
    : null;
  return defaultSetupScript(detectFramework(paths, pkgJson), paths);
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("env.read", id, { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  return ok({
    setupScript: await effectiveSetup(ws, user.id),
    custom: Boolean(ws.setupScript?.trim()),
    cached: Boolean(ws.envSnapshotId && ws.envReadyAt),
    readyAt: ws.envReadyAt?.toISOString() ?? null,
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("env.write", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);

  const trimmed = parsed.data.setupScript.trim();
  await db().workspace.update({
    where: { id: g.ws.id },
    data: { setupScript: trimmed || null, envSnapshotId: null, envSnapshotKey: null, envReadyAt: null },
  });
  return ok({ saved: true });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("env.write", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "rebuild") return apiErrors.badRequest("Unknown action");

  await clearEnvCache(g.ws.id);
  return ok({ rebuilt: true });
}
