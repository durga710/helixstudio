import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { SpaceScreen } from "@/components/screens/space-screen";

export const metadata = { title: "Space" };
export const dynamic = "force-dynamic";

export default async function SpacePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  if (!dbEnabled()) {
    return (
      <div className="pad-screen">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">
            Collaborate
          </div>
          <h1 className="text-[22px] font-bold tracking-tight">Space</h1>
          <Card className="mt-6 p-8 text-center text-sm text-txt3">
            Spaces let you share workspaces with friends and teammates. Connect a database
            (<code className="font-mono">DATABASE_URL</code>) to create or join one.
          </Card>
        </div>
      </div>
    );
  }

  // Consume a pending invite cookie set by the login flow (mirrors the
  // guest-upgrade pattern in editor/page.tsx). If the user signed in to accept
  // an invite, the joinCode is waiting here — join the Space, then clear it.
  const jar = await cookies();
  const joinCode = jar.get("helix.join-space")?.value;
  if (joinCode) {
    await schemaReady();
    const space = await db().space.findUnique({
      where: { joinCode },
      select: { id: true },
    });
    if (space) {
      await db().spaceMember.upsert({
        where: { spaceId_userId: { spaceId: space.id, userId: session.user.id } },
        create: { spaceId: space.id, userId: session.user.id, role: "member" },
        update: {},
      });
    }
    jar.set("helix.join-space", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    if (space) redirect(`/space?s=${space.id}`);
    redirect("/space?invite=invalid");
  }

  return <SpaceScreen youName={session.user.name ?? null} />;
}
