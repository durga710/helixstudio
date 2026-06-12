import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { dbEnabled } from "@/lib/db";
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

  // A pending invite cookie means the user signed in to accept an invite.
  // Hand it to the join route handler, which joins AND clears the cookie
  // (pages can't modify cookies during render).
  const joinCode = (await cookies()).get("helix.join-space")?.value;
  if (joinCode) redirect(`/space/join/${encodeURIComponent(joinCode)}`);

  return <SpaceScreen youName={session.user.name ?? null} />;
}
