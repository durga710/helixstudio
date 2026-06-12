import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Invite-link landing: /space/join/<joinCode>. Signed-in users join and land
 * on the Space; guests are sent to sign in carrying the code (consumed here on
 * return, mirroring the guest-upgrade cookie pattern).
 */
export default async function JoinSpacePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await auth();

  // Not signed in (or a guest): bounce to login, remember the code.
  if (!session?.user?.id || session.user.isGuest) {
    (await cookies()).set("helix.join-space", code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    redirect("/login");
  }

  if (dbEnabled()) {
    await schemaReady();
    const space = await db().space.findUnique({ where: { joinCode: code }, select: { id: true } });
    if (space) {
      await db().spaceMember.upsert({
        where: { spaceId_userId: { spaceId: space.id, userId: session.user.id } },
        create: { spaceId: space.id, userId: session.user.id, role: "member" },
        update: {},
      });
      redirect(`/space?s=${space.id}`);
    }
  }
  // Bad/expired link → land on the Space page with a notice.
  redirect("/space?invite=invalid");
}
