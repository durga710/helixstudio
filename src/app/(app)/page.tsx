import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Bot, FolderGit2, Lock, MessageSquare, FileCode2, Sparkles, Users, GraduationCap, ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { getGitConnections } from "@/lib/git";
import { PROVIDER_META, type GitProviderName } from "@/lib/git/meta";
import { timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CircuitTraces } from "@/components/brand";
import { Pill } from "@/components/ui/pill";
import { DashboardActions } from "@/components/screens/dashboard-actions";

export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** "wrote 3 file(s); updated project notes" from the stored tool actions, or the reply's first line. */
function activityLabel(content: string, actions: unknown): string {
  if (Array.isArray(actions) && actions.length > 0) {
    const labels = actions
      .map((a) => (a && typeof a === "object" && "label" in a ? String((a as { label: unknown }).label) : null))
      .filter((l): l is string => Boolean(l))
      .slice(0, 3);
    if (labels.length) return labels.join("; ");
  }
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 90 ? flat.slice(0, 90) + "…" : flat || "replied";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  // Login lands here — if the user signed in to accept a Space invite, finish
  // the join first (the route handler joins and clears the cookie).
  if (!session.user.isGuest) {
    const joinCode = (await cookies()).get("helix.join-space")?.value;
    if (joinCode) redirect(`/space/join/${encodeURIComponent(joinCode)}`);
  }

  const firstName = (session.user.name ?? "there").split(" ")[0];
  const userId = session.user.id;

  // Without a database there is nothing real to show — greet and point at
  // the editor (demo store data is never rendered here anymore).
  if (!dbEnabled()) {
    return (
      <div className="pad-screen">
        <Hero firstName={firstName} stats={null} />
        <Card className="mt-6 p-8 text-center text-sm text-txt3">
          Connect a database (DATABASE_URL) to track workspaces and activity here.
        </Card>
      </div>
    );
  }
  await schemaReady();

  const [workspaceCount, fileCount, aiTurns, connections, workspaces, sharedWorkspaces, recentTurns] = await Promise.all([
    db().workspace.count({ where: { userId } }),
    db().workspaceFile.count({ where: { deleted: false, workspace: { userId } } }),
    db().workspaceMessage.count({ where: { role: "assistant", workspace: { userId } } }),
    getGitConnections(userId),
    db().workspace.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        mode: true,
        provider: true,
        repo: true,
        updatedAt: true,
        _count: { select: { files: true, messages: true } },
      },
    }),
    // Teammates' workspaces shared via a Space the user belongs to.
    db().workspace.findMany({
      where: {
        space: { members: { some: { userId } } },
        NOT: { userId },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        mode: true,
        provider: true,
        repo: true,
        updatedAt: true,
        user: { select: { name: true, email: true } },
        _count: { select: { files: true, messages: true } },
      },
    }),
    db().workspaceMessage.findMany({
      where: { role: "assistant", workspace: { userId } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        content: true,
        actions: true,
        createdAt: true,
        workspace: { select: { id: true, name: true } },
      },
    }),
  ]);

  const hostsConnected = Object.values(connections).filter(Boolean).length;

  return (
    <div className="pad-screen">
      <Hero
        firstName={firstName}
        stats={[
          { n: String(workspaceCount), l: "Workspaces" },
          { n: fileCount.toLocaleString(), l: "Files in your projects" },
          { n: aiTurns.toLocaleString(), l: "AI turns" },
          { n: String(hostsConnected), l: hostsConnected === 1 ? "Git host connected" : "Git hosts connected" },
        ]}
      />

      {/* Learn AI — entry to the guided lessons */}
      <Link
        href="/lab"
        className="group mt-6 flex items-center gap-3.5 rounded-card-lg border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] px-5 py-4 transition-colors hover:border-accent"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-hl">
          <GraduationCap className="h-5 w-5 text-accent" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-txt">Learn AI — the easy way</span>
          <span className="block text-[12.5px] leading-relaxed text-txt2">
            Hands-on, guided lessons that teach how AI actually works. No code — start from zero.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* Workspaces */}
      <div className="mb-3 mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Your workspaces</h3>
        {workspaceCount > 0 && (
          <Link href="/editor" className="text-xs text-accent hover:underline">
            View all →
          </Link>
        )}
      </div>
      {workspaces.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-txt2">No workspaces yet.</p>
          <p className="mt-1 text-xs text-txt3">
            Start your first project — describe it to Helix, import a repo, or upload a folder.
          </p>
          <div className="mt-4 flex justify-center">
            <DashboardActions />
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((w) => {
            const meta = PROVIDER_META[w.provider as GitProviderName];
            return (
              <Link key={w.id} href={`/editor/${w.id}`} className="block">
                <Card className="cursor-pointer p-4 transition-all duration-150 hover:-translate-y-px hover:border-accent">
                  <div className="mb-2 flex items-center gap-2">
                    {w.mode === "IMPORT" ? (
                      <FolderGit2 className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.7} />
                    ) : (
                      <Sparkles className="h-4 w-4 shrink-0 text-ok" strokeWidth={1.7} />
                    )}
                    <span className="truncate text-[13.5px] font-semibold">{w.name}</span>
                  </div>
                  {w.repo && (
                    <p className="mb-2 flex items-center gap-1 truncate font-mono text-[11px] text-txt3">
                      <Lock className="h-3 w-3 shrink-0 opacity-60" />
                      {w.repo}
                      {w.provider !== "github" && meta && (
                        <span className="ml-1 uppercase tracking-wide text-[9px]">{meta.label}</span>
                      )}
                    </p>
                  )}
                  <div className="flex items-center gap-3 font-mono text-[10.5px] text-txt3">
                    <span className="inline-flex items-center gap-1">
                      <FileCode2 className="h-3 w-3" /> {w._count.files}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {w._count.messages}
                    </span>
                    <span className="ml-auto">{timeAgo(w.updatedAt.toISOString())}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Shared with you — teammates' workspaces shared via your Spaces */}
      {sharedWorkspaces.length > 0 && (
        <>
          <div className="mb-3 mt-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Shared with you</h3>
              <Users className="h-3.5 w-3.5 text-txt3" strokeWidth={1.7} />
            </div>
            <Link href="/space" className="text-xs text-accent hover:underline">
              Spaces →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sharedWorkspaces.map((w) => {
              const meta = PROVIDER_META[w.provider as GitProviderName];
              return (
                <Link key={w.id} href={`/editor/${w.id}`} className="block">
                  <Card className="cursor-pointer p-4 transition-all duration-150 hover:-translate-y-px hover:border-accent">
                    <div className="mb-1 flex items-center gap-2">
                      {w.mode === "IMPORT" ? (
                        <FolderGit2 className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.7} />
                      ) : (
                        <Sparkles className="h-4 w-4 shrink-0 text-ok" strokeWidth={1.7} />
                      )}
                      <span className="truncate text-[13.5px] font-semibold">{w.name}</span>
                    </div>
                    <p className="mb-2 truncate text-[11px] text-txt3">
                      by {w.user.name ?? w.user.email ?? "a teammate"}
                    </p>
                    {w.repo && (
                      <p className="mb-2 flex items-center gap-1 truncate font-mono text-[11px] text-txt3">
                        <Lock className="h-3 w-3 shrink-0 opacity-60" />
                        {w.repo}
                        {w.provider !== "github" && meta && (
                          <span className="ml-1 uppercase tracking-wide text-[9px]">{meta.label}</span>
                        )}
                      </p>
                    )}
                    <div className="flex items-center gap-3 font-mono text-[10.5px] text-txt3">
                      <span className="inline-flex items-center gap-1">
                        <FileCode2 className="h-3 w-3" /> {w._count.files}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {w._count.messages}
                      </span>
                      <span className="ml-auto">{timeAgo(w.updatedAt.toISOString())}</span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* AI activity */}
      <div className="mb-3 mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent AI activity</h3>
      </div>
      <Card>
        {recentTurns.length === 0 && (
          <div className="p-8 text-center text-sm text-txt3">
            No activity yet — open a workspace and ask Helix to build something.
          </div>
        )}
        {recentTurns.map((t, i) => (
          <div
            key={t.id}
            className={`flex items-center gap-[11px] px-4 py-[11px] text-[12.5px] ${
              i < recentTurns.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span className="shrink-0 text-txt3">
              <Bot className="h-[15px] w-[15px]" strokeWidth={1.7} />
            </span>
            <span className="min-w-0 truncate">
              <Pill tone="accent">helix</Pill>
              <span className="text-txt2">&nbsp; {activityLabel(t.content, t.actions)} in </span>
              <Link href={`/editor/${t.workspace.id}`} className="font-semibold text-txt hover:underline">
                {t.workspace.name}
              </Link>
            </span>
            <span className="ml-auto whitespace-nowrap text-[11.5px] text-txt3">
              {timeAgo(t.createdAt.toISOString())}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Hero({
  firstName,
  stats,
}: {
  firstName: string;
  stats: { n: string; l: string }[] | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-card-lg border border-border bg-panel px-7 py-[26px] after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(900px_240px_at_8%_-40%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)]">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Workspace</div>
      <CircuitTraces className="pointer-events-none absolute -right-6 -top-8 h-[210px] w-[440px] text-[color-mix(in_srgb,var(--brand-cyan)_55%,var(--accent))] opacity-[0.08]" />
      <h2 className="relative text-[23px] font-bold tracking-tight">
        {greeting()}, <span className="brand-gradient-text">{firstName}</span>.
      </h2>
      <p className="relative mt-1.5 max-w-[560px] text-txt2">
        Describe what you want built and watch it land in a live workspace — then run it in the cloud
        and push it to your repos.
      </p>
      <DashboardActions />
      {stats && (
        <div className="relative mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.l} className="rounded-card border border-border bg-panel px-4 py-3.5">
              <div className="flex items-baseline gap-1.5 text-[21px] font-bold tracking-tight">{stat.n}</div>
              <div className="mt-1 h-[2px] w-6 rounded-full brand-gradient-fill opacity-80" />
              <div className="mt-1 text-[11.5px] text-txt2">{stat.l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
