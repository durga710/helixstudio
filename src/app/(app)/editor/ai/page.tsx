import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { STUDIO_CATALOG } from "@/lib/lessons/studios";
import { getLessonsForViewer } from "@/lib/lessons/store-db";
import { AiStudio } from "@/components/studio/ai-studio";

export const metadata: Metadata = { title: "AI · Editor" };
export const dynamic = "force-dynamic";

export default async function AiEditorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  const lessons = await getLessonsForViewer(session.user.id).catch(() => []);

  return (
    <div className="mx-auto h-full min-h-0 max-w-[1800px] px-4 py-4">
      <AiStudio
        studios={STUDIO_CATALOG}
        lessons={lessons.map((l) => ({ id: l.id, title: l.title, blurb: l.blurb, concept: l.concept }))}
      />
    </div>
  );
}
