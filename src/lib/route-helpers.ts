import "server-only";

/**
 * Shared guard for API routes: auth → rate limit → (optionally) load the
 * workspace with an ownership check. Returns either the context or a ready
 * NextResponse error.
 */

import type { Workspace } from "@/generated/prisma/client";
import { requireUser, AuthError, type SessionUser } from "@/lib/auth";
import { apiErrors } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { schemaReady } from "@/lib/db";
import { getWorkspaceForUser, getWorkspaceForViewer } from "@/lib/workspace";

export async function guard(
  bucket: string,
  opts: { limit: number; windowMs: number },
): Promise<{ user: SessionUser } | { response: Response }> {
  // Self-bootstrapping schema: make sure the database is provisioned before
  // the first query this request will run.
  await schemaReady();
  let user: SessionUser;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof AuthError) return { response: apiErrors.unauthorized() };
    throw e;
  }
  const rl = await rateLimit(`${bucket}:${user.id}`, opts);
  if (!rl.success) return { response: apiErrors.rateLimit(rl.reset) };
  return { user };
}

/**
 * Load a workspace for a route.
 *   "write" (default) — owner only (edit, chat, push, delete, env, tasks).
 *   "read"            — owner OR a Space member (view files, diff, run status).
 * `isOwner` lets read routes resolve git auth by the OWNER and the UI render
 * a read-only view for non-owners.
 */
export async function guardWorkspace(
  bucket: string,
  workspaceId: string,
  opts: { limit: number; windowMs: number },
  access: "read" | "write" = "write",
): Promise<{ user: SessionUser; ws: Workspace; isOwner: boolean } | { response: Response }> {
  const g = await guard(bucket, opts);
  if ("response" in g) return g;

  if (access === "read") {
    const v = await getWorkspaceForViewer(workspaceId, g.user.id);
    if (!v) return { response: apiErrors.notFound("Workspace") };
    return { user: g.user, ws: v.ws, isOwner: v.isOwner };
  }
  const ws = await getWorkspaceForUser(workspaceId, g.user.id);
  if (!ws) return { response: apiErrors.notFound("Workspace") };
  return { user: g.user, ws, isOwner: true };
}
