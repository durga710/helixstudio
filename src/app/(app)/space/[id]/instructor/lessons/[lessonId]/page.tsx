import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, dbEnabled } from "@/lib/db";
import { LessonEditor } from "@/components/lab/lesson-editor";
import type { LessonManifest, LessonStep } from "@/lib/lessons/types";

export const metadata: Metadata = { title: "Edit lesson" };
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; lessonId: string }>;
}

export default async function LessonEditPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  if (!dbEnabled()) notFound();
  const { id, lessonId } = await params;

  const lesson = await db().lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, authorId: true, spaceId: true, status: true, manifest: true, steps: true },
  });
  if (!lesson || lesson.authorId !== session.user.id || lesson.spaceId !== id) notFound();

  return (
    <LessonEditor
      lessonId={lesson.id}
      spaceId={id}
      initialStatus={lesson.status}
      initialManifest={{ ...(lesson.manifest as unknown as LessonManifest), id: lesson.id }}
      initialSteps={lesson.steps as unknown as LessonStep[]}
    />
  );
}
