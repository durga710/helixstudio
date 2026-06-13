import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLesson } from "@/lib/lessons/store";
import { LessonRunner } from "@/components/lab/lesson-runner";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const lesson = getLesson(id);
  return { title: lesson ? `${lesson.manifest.title} · AI Lab` : "AI Lab" };
}

export default async function LessonPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) notFound();
  return <LessonRunner lesson={lesson} />;
}
