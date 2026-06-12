import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { Studio } from "@/components/studio/studio";

export const metadata = { title: "Editor" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  if (!dbEnabled()) redirect("/editor");
  await schemaReady();

  const { id } = await params;
  const ws = await db().workspace.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, mode: true, repo: true, provider: true, baseBranch: true },
  });
  if (!ws || ws.userId !== session.user.id) notFound();

  return (
    <div className="mx-auto h-full min-h-0 max-w-[1800px] px-4 py-4">
      <Studio
        workspace={{
          id: ws.id,
          name: ws.name,
          mode: ws.mode,
          repo: ws.repo,
          provider: ws.provider,
          baseBranch: ws.baseBranch,
        }}
        isGuest={Boolean(session.user.isGuest)}
      />
    </div>
  );
}
