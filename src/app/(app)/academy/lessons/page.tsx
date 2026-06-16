import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLessonsForViewer } from "@/lib/lessons/store-db";
import { LessonsScreen } from "@/components/screens/lessons-screen";

export const metadata: Metadata = { title: "Modules · AI Academy" };
export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  return <LessonsScreen lessons={await getLessonsForViewer(session.user.id)} />;
}
