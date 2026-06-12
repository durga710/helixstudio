import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbEnabled } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { GradebookScreen } from "@/components/screens/gradebook-screen";

export const metadata = { title: "Gradebook" };
export const dynamic = "force-dynamic";

export default async function GradebookPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  const { s: spaceId } = await searchParams;
  if (!spaceId) redirect("/space");

  if (!dbEnabled()) {
    return (
      <div className="pad-screen">
        <div className="mx-auto max-w-[760px]">
          <Card className="mt-6 p-8 text-center text-sm text-txt3">
            The gradebook needs a database (<code className="font-mono">DATABASE_URL</code>).
          </Card>
        </div>
      </div>
    );
  }

  return <GradebookScreen spaceId={spaceId} />;
}
