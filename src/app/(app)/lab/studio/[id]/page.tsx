import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStudioMeta } from "@/lib/lessons/studios";
import { StudioWorkbench } from "@/components/lab/studio-workbench";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const meta = getStudioMeta(id);
  return { title: meta ? `${meta.title} · AI Lab` : "Studio · AI Lab" };
}

export default async function StudioPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  const { id } = await params;
  const meta = getStudioMeta(id);
  if (!meta) notFound();
  return <StudioWorkbench meta={meta} />;
}
