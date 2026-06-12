import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOIN_COOKIE = "helix.join-space";
const clearCookie = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 0 };

/**
 * Invite-link landing: /space/join/<joinCode>.
 *
 * A Route Handler (not a page) on purpose: it must SET a cookie for signed-out
 * visitors and CLEAR it after consuming — both illegal during page render —
 * and it must run outside the (app) layout, whose auth gate would bounce
 * anonymous invitees to /welcome and drop the code.
 *
 * Flow:
 *   - signed-out / guest → carry the code in a cookie, send to /login; the
 *     dashboard and /space redirect back here after sign-in.
 *   - signed in, already a member → straight into the Space.
 *   - signed in, NOT a member → the confirmation page (/space/join/confirm),
 *     where the user explicitly chooses Join or Not now. We never auto-join.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await auth();
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  // Not signed in (or a guest) → force a real sign-in first, carrying the code.
  if (!session?.user?.id || session.user.isGuest) {
    const res = to("/login");
    res.cookies.set(JOIN_COOKIE, code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    return res;
  }

  if (dbEnabled()) {
    await schemaReady();
    const space = await db().space.findUnique({
      where: { joinCode: code },
      select: { id: true },
    });
    if (space) {
      const existing = await db().spaceMember.findUnique({
        where: { spaceId_userId: { spaceId: space.id, userId: session.user.id } },
        select: { id: true },
      });
      // Already a member → no prompt needed; clear the cookie and go in.
      if (existing) {
        const res = to(`/space?s=${space.id}`);
        res.cookies.set(JOIN_COOKIE, "", clearCookie);
        return res;
      }
      // Not a member → ASK first. Clear the cookie now (the code rides in the
      // URL) so the post-login redirect loop doesn't keep firing.
      const res = to(`/space/join/confirm?code=${encodeURIComponent(code)}`);
      res.cookies.set(JOIN_COOKIE, "", clearCookie);
      return res;
    }
  }

  // Bad/expired link → land on the Space page with a notice.
  const res = to("/space?invite=invalid");
  res.cookies.set(JOIN_COOKIE, "", clearCookie);
  return res;
}
