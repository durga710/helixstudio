import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getGameMeta } from "@/lib/lessons/games";
import { GameShell } from "@/components/lab/game-shell";

export const metadata: Metadata = { title: "Game · AI Lab" };
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function GamePage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  const { id } = await params;
  const meta = getGameMeta(id);
  if (!meta) notFound();
  return <GameShell meta={meta} />;
}
