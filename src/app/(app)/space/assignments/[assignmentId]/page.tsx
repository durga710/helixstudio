import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbEnabled } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { AssignmentScreen } from "@/components/screens/assignment-screen";

export const metadata = { title: "Assignment" };
export const dynamic = "force-dynamic";

export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  const { assignmentId } = await params;
  const { s: spaceId } = await searchParams;
  if (!spaceId) redirect("/space");

  if (!dbEnabled()) {
    return (
      <div className="pad-screen">
        <div className="mx-auto max-w-[760px]">
          <Card className="mt-6 p-8 text-center text-sm text-txt3">
            Assignments need a database (<code className="font-mono">DATABASE_URL</code>).
          </Card>
        </div>
      </div>
    );
  }

  return <AssignmentScreen spaceId={spaceId} assignmentId={assignmentId} />;
}
