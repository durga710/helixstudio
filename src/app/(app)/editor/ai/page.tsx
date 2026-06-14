import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { STUDIO_CATALOG } from "@/lib/lessons/studios";
import { AiStudio } from "@/components/studio/ai-studio";

export const metadata: Metadata = { title: "Build an AI Model · Editor" };
export const dynamic = "force-dynamic";

export default async function AiEditorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  return (
    <div className="mx-auto h-full min-h-0 max-w-[1800px] px-4 py-4">
      <AiStudio studios={STUDIO_CATALOG} />
    </div>
  );
}
