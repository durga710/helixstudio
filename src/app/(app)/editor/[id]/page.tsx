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
    select: { id: true, userId: true, name: true, mode: true, kind: true, gameCategory: true, repo: true, provider: true, baseBranch: true, spaceId: true },
  });
  if (!ws) notFound();

  // Owners always get in. Space members get a read-only view of a workspace
  // shared into a Space they belong to; everyone else is a 404.
  const isOwner = ws.userId === session.user.id;
  let ownerName: string | undefined;
  if (!isOwner) {
    if (!ws.spaceId) notFound();
    // Membership check and owner identity are independent — one round-trip.
    const [member, owner] = await Promise.all([
      db().spaceMember.findUnique({
        where: { spaceId_userId: { spaceId: ws.spaceId, userId: session.user.id } },
        select: { id: true },
      }),
      db().user.findUnique({
        where: { id: ws.userId },
        select: { name: true, email: true },
      }),
    ]);
    if (!member) notFound();
    ownerName = owner?.name ?? owner?.email ?? "a teammate";
  }

  return (
    <div className="mx-auto h-full min-h-0 max-w-[1800px] px-4 py-4">
      <Studio
        workspace={{
          id: ws.id,
          name: ws.name,
          mode: ws.mode,
          kind: ws.kind === "game" ? "game" : "app",
          gameCategory: ws.gameCategory,
          repo: ws.repo,
          provider: ws.provider,
          baseBranch: ws.baseBranch,
          spaceId: ws.spaceId,
        }}
        isGuest={Boolean(session.user.isGuest)}
        isOwner={isOwner}
        ownerName={ownerName}
      />
    </div>
  );
}
