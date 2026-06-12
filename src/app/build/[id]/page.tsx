import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { BuildStudio } from "@/components/build/build-studio";

export const metadata: Metadata = { title: "Building" };
export const dynamic = "force-dynamic";

/* The live builder: chat + build timeline on the left, the app previewing
 * on the right while the agent writes it. Owner-only (the full editor
 * handles Space sharing; this surface is for creation). */
export default async function BuildWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/build");
  if (!dbEnabled()) redirect("/build");
  await schemaReady();

  const { id } = await params;
  const ws = await db().workspace.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, mode: true },
  });
  if (!ws || ws.userId !== session.user.id) notFound();

  return (
    <BuildStudio
      workspace={{ id: ws.id, name: ws.name }}
      isGuest={Boolean(session.user.isGuest)}
    />
  );
}
