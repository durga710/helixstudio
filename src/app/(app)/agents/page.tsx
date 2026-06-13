import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { db, dbEnabled } from "@/lib/db";
import { store } from "@/lib/store";
import { AgentsScreen } from "@/components/screens/agents-screen";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;
  const { agents } = store();

  let workspaceId: string | undefined;
  let workspaceName: string | undefined;

  if (w && dbEnabled()) {
    const session = await auth();
    if (session?.user) {
      const ws = await db().workspace.findFirst({
        where: { id: w, userId: session.user.id },
        select: { id: true, name: true },
      });
      if (ws) {
        workspaceId = ws.id;
        workspaceName = ws.name;
      }
    }
  }

  return (
    <Suspense>
      <AgentsScreen agents={agents} workspaceId={workspaceId} workspaceName={workspaceName} />
    </Suspense>
  );
}
