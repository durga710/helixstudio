import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, dbEnabled } from "@/lib/db";
import { isTeacher } from "@/lib/lessons/teacher";
import { getPublicLessons } from "@/lib/lessons/store-db";
import { LibraryScreen } from "@/components/screens/library-screen";

export const metadata: Metadata = { title: "Lesson library" };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  // Teacher-gated: only classroom owners browse the library (kids never do).
  if (!dbEnabled() || !(await isTeacher(session.user.id))) redirect("/academy");

  const [lessons, classes] = await Promise.all([
    getPublicLessons(),
    db().space.findMany({
      where: { ownerId: session.user.id, kind: "classroom" },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return <LibraryScreen lessons={lessons} classes={classes} />;
}
