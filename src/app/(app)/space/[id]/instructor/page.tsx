import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, dbEnabled } from "@/lib/db";
import { InstructorDashboard } from "@/components/screens/instructor-dashboard";

export const metadata: Metadata = { title: "Instructor Dashboard" };
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function InstructorPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");
  if (!dbEnabled()) notFound();
  const { id } = await params;

  const space = await db().space.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, ownerId: true },
  });
  // Owner of a classroom only.
  if (!space || space.ownerId !== session.user.id || space.kind !== "classroom") notFound();

  return <InstructorDashboard spaceId={space.id} spaceName={space.name} />;
}
