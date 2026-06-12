import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { canJoin } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOIN_COOKIE = "helix.join-space";

/**
 * Invite-link landing: /space/join/<joinCode>.
 *
 * A Route Handler (not a page) on purpose: it must SET a cookie for signed-out
 * visitors and CLEAR it after consuming — both illegal during page render —
 * and it must run outside the (app) layout, whose auth gate would bounce
 * anonymous invitees to /welcome and drop the code.
 *
 * Signed-in users join and land on the Space. Guests/visitors are sent to
 * sign in carrying the code in a cookie; /space and the dashboard redirect
 * back here after login to complete the join.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await auth();
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (!session?.user?.id || session.user.isGuest) {
    const res = to("/login");
    res.cookies.set(JOIN_COOKIE, code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    return res;
  }

  if (dbEnabled()) {
    await schemaReady();
    const space = await db().space.findUnique({
      where: { joinCode: code },
      select: { id: true, plan: true, seats: true, currentPeriodEnd: true, _count: { select: { members: true } } },
    });
    if (space) {
      const existing = await db().spaceMember.findUnique({
        where: { spaceId_userId: { spaceId: space.id, userId: session.user.id } },
        select: { id: true },
      });
      if (!existing) {
        const gate = canJoin(space, space._count.members);
        if (!gate.allowed) {
          // Seats are full — land on the Space page with a notice.
          const res = to("/space?invite=full");
          res.cookies.set(JOIN_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
          return res;
        }
        await db().spaceMember.create({
          data: { spaceId: space.id, userId: session.user.id, role: "member" },
        });
      }
      const res = to(`/space?s=${space.id}`);
      res.cookies.set(JOIN_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    }
  }

  // Bad/expired link → land on the Space page with a notice.
  const res = to("/space?invite=invalid");
  res.cookies.set(JOIN_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
