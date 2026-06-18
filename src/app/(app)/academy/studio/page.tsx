import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { STUDIO_CATALOG } from "@/lib/lessons/studios";
import { StudioGalleryScreen } from "@/components/screens/studio-gallery-screen";

export const metadata: Metadata = { title: "Studios · AI Academy" };
export const dynamic = "force-dynamic";

export default async function StudioGalleryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  return <StudioGalleryScreen studios={STUDIO_CATALOG} />;
}
