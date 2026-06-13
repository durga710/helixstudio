import "server-only";

/**
 * Shared guard for API routes: auth → rate limit → (optionally) load the
 * workspace with an ownership check. Returns either the context or a ready
 * NextResponse error.
 */

import type { Workspace } from "@/generated/prisma/client";
import { requireUser, AuthError, auth, type SessionUser } from "@/lib/auth";
import { apiErrors, err } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { schemaReady, db, dbEnabled } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
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
  // Admin suspension bites within one request — sessions are JWTs, so a
  // session-level flag would lag until the next token refresh.
  if (dbEnabled()) {
    const u = await db().user.findUnique({ where: { id: user.id }, select: { suspendedAt: true } });
    if (u?.suspendedAt) {
      return { response: err("SUSPENDED", "This account is suspended. Contact the administrator.", 403) };
    }
  }
  const rl = await rateLimit(`${bucket}:${user.id}`, opts);
  if (!rl.success) return { response: apiErrors.rateLimit(rl.reset) };
  return { user };
}

/**
 * Admin-only routes (the /api/admin/* surface). Non-admins get a 404 — the
 * same "this page doesn't exist" posture as the /admin pages themselves.
 * No rate bucket: admins are allowlisted humans (ADMIN_EMAILS).
 */
export async function guardAdmin(): Promise<{ admin: SessionUser } | { response: Response }> {
  await schemaReady();
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !isAdminEmail(u.email)) {
    return { response: apiErrors.notFound() };
  }
  return { admin: { id: u.id, name: u.name ?? null, email: u.email ?? null, image: u.image ?? null } };
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
