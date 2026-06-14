import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { StudioHome } from "@/components/studio/studio-home";

export const metadata = { title: "Editor" };
export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  if (!dbEnabled()) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-xl font-semibold">Editor</h1>
        <p className="mt-2 text-sm text-txt2">
          The editor stores workspaces in PostgreSQL. Set <code className="font-mono">DATABASE_URL</code> to enable it.
        </p>
      </div>
    );
  }
  await schemaReady();

  // Guest → real account upgrade: move the guest's workspaces onto this
  // account, then delete the orphaned guest user. Idempotent (the guest row
  // is gone after the first pass) and guarded — only ever drains accounts
  // marked isGuest, so the cookie can't be abused to steal a real account.
  const upgradeFrom = (await cookies()).get("helix.upgrade-from")?.value;
  if (upgradeFrom && upgradeFrom !== session.user.id && !session.user.isGuest) {
    const guest = await db().user.findUnique({
      where: { id: upgradeFrom },
      select: { isGuest: true },
    });
    if (guest?.isGuest) {
      await db().$transaction([
        db().workspace.updateMany({
          where: { userId: upgradeFrom },
          data: { userId: session.user.id },
        }),
        db().user.delete({ where: { id: upgradeFrom } }),
      ]);
    }
  }

  const [workspaces, shared] = await Promise.all([
    db().workspace.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        mode: true,
        kind: true,
        repo: true,
        provider: true,
        updatedAt: true,
        _count: { select: { files: true, messages: true } },
      },
      take: 50,
    }),
    // Teammates' workspaces shared via a Space the user belongs to.
    db().workspace.findMany({
      where: {
        space: { members: { some: { userId: session.user.id } } },
        NOT: { userId: session.user.id },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        mode: true,
        kind: true,
        repo: true,
        provider: true,
        updatedAt: true,
        user: { select: { name: true, email: true } },
        _count: { select: { files: true, messages: true } },
      },
      take: 12,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <StudioHome
        isGuest={Boolean(session.user.isGuest)}
        isAdmin={isAdminEmail(session.user.email ?? "")}
        workspaces={workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          mode: w.mode,
          kind: w.kind === "game" ? "game" : "app",
          repo: w.repo,
          provider: w.provider,
          updatedAt: w.updatedAt.toISOString(),
          fileCount: w._count.files,
          messageCount: w._count.messages,
        }))}
        sharedWorkspaces={shared.map((w) => ({
          id: w.id,
          name: w.name,
          mode: w.mode,
          kind: w.kind === "game" ? "game" : "app",
          repo: w.repo,
          provider: w.provider,
          updatedAt: w.updatedAt.toISOString(),
          fileCount: w._count.files,
          messageCount: w._count.messages,
          ownerName: w.user.name ?? w.user.email ?? "a teammate",
        }))}
      />
    </div>
  );
}
