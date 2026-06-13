import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLessonManifests } from "@/lib/lessons/store";
import { AILabScreen } from "@/components/screens/ai-lab-screen";

export const metadata: Metadata = { title: "AI Lab" };
export const dynamic = "force-dynamic";

export default async function LabPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  return <AILabScreen lessons={getLessonManifests()} />;
}
