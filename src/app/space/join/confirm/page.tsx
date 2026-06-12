import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { canJoin } from "@/lib/billing";
import { BrandMark } from "@/components/brand";
import { JoinButtons } from "./join-buttons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Join a Space · Helix", robots: { index: false } };

/**
 * Invite confirmation: "Join the team 'X'?" with an explicit Yes/No, reached
 * only after sign-in (the /space/join/[code] route handler sends signed-in
 * non-members here). Standalone — no app shell — so the choice is the only
 * thing on screen.
 */
export default async function ConfirmJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const session = await auth();

  // Not signed in / guest, or no code → re-enter the cookie flow (which sends
  // them to sign in carrying the code).
  if (!session?.user?.id || session.user.isGuest) {
    redirect(`/space/join/${encodeURIComponent(code ?? "")}`);
  }
  if (!code || !dbEnabled()) redirect("/space?invite=invalid");
  await schemaReady();

  const space = await db().space.findUnique({
    where: { joinCode: code },
    select: {
      id: true,
      name: true,
      kind: true,
      plan: true,
      seats: true,
      currentPeriodEnd: true,
      owner: { select: { name: true, email: true } },
      _count: { select: { members: true } },
    },
  });

  // Already a member → straight in, no prompt.
  if (space) {
    const existing = await db().spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: space.id, userId: session.user.id } },
      select: { id: true },
    });
    if (existing) redirect(`/space?s=${space.id}`);
  }

  const isClassroom = space?.kind === "classroom";
  const gate = space ? canJoin(space, space._count.members) : { allowed: false, reason: "" };
  const ownerName = space?.owner.name ?? space?.owner.email ?? "someone";

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card-lg border border-border2 bg-panel p-7 text-center shadow-pop">
        <div className="mx-auto grid h-12 w-12 place-items-center overflow-hidden rounded-[13px]">
          <BrandMark size={48} />
        </div>

        {!space ? (
          <>
            <h1 className="mt-4 text-lg font-semibold text-txt">This invite isn&apos;t valid</h1>
            <p className="mt-1.5 text-[13px] text-txt2">
              The link may have expired or been revoked. Ask whoever invited you for a fresh one.
            </p>
            <Link
              href="/space"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-border2 bg-panel px-4 py-2.5 text-sm font-medium text-txt2 transition hover:border-accent hover:text-txt"
            >
              Go to Spaces
            </Link>
          </>
        ) : (
          <>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border2 px-2.5 py-1 text-[11px] text-txt3">
              {isClassroom ? <GraduationCap className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              {isClassroom ? "Classroom invite" : "Team invite"}
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-txt">
              Join {isClassroom ? "the classroom" : "the team"}{" "}
              <span className="text-accent">{space.name}</span>?
            </h1>
            <p className="mt-2 text-[13px] text-txt2">
              Invited by {ownerName} · {space._count.members} member{space._count.members === 1 ? "" : "s"}.
              You&apos;ll be able to view and collaborate on shared workspaces.
            </p>

            {gate.allowed ? (
              <JoinButtons code={code} />
            ) : (
              <>
                <p className="mt-5 rounded-lg border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_8%,transparent)] px-3 py-2 text-[12.5px] text-warn">
                  {gate.reason ?? "This team is full right now."}
                </p>
                <Link
                  href="/space"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-border2 bg-panel px-4 py-2.5 text-sm font-medium text-txt2 transition hover:border-accent hover:text-txt"
                >
                  Go to Spaces
                </Link>
              </>
            )}
            <p className="mt-4 text-[11px] text-txt3">
              Signed in as <span className="font-mono">{session.user.email}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
