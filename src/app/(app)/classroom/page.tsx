import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { dbEnabled } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { SpaceScreen } from "@/components/screens/space-screen";

export const metadata = { title: "Classroom" };
export const dynamic = "force-dynamic";

export default async function ClassroomPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  if (!dbEnabled()) {
    return (
      <div className="pad-screen">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Teach</div>
          <h1 className="text-[22px] font-bold tracking-tight">Classroom</h1>
          <Card className="mt-6 p-8 text-center text-sm text-txt3">
            Classrooms let you hand out assignments and AI lessons to your students. Connect a database
            (<code className="font-mono">DATABASE_URL</code>) to create one.
          </Card>
        </div>
      </div>
    );
  }

  // A pending invite cookie means the user signed in to accept an invite —
  // hand it to the join route (it joins + clears the cookie).
  const joinCode = (await cookies()).get("helix.join-space")?.value;
  if (joinCode) redirect(`/space/join/${encodeURIComponent(joinCode)}`);

  return <SpaceScreen youName={session.user.name ?? null} filter="classroom" />;
}
