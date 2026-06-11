import Link from "next/link";
import { ChartLine, Check, ShieldCheck, SquareDashed } from "lucide-react";
import { auth } from "@/lib/auth";
import { store } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CircuitTraces } from "@/components/brand";
import { Pill } from "@/components/ui/pill";
import { ProjectLogos } from "@/components/logos";
import { DashboardActions } from "@/components/screens/dashboard-actions";
import type { ActivityKind, Health } from "@/lib/types";

export const dynamic = "force-dynamic";

const healthPill: Record<Health, { tone: "green" | "amber" | "red"; label: string }> = {
  healthy: { tone: "green", label: "healthy" },
  review: { tone: "amber", label: "in review" },
  issues: { tone: "red", label: "2 issues" },
};

const activityMeta: Record<ActivityKind, { tone: "green" | "amber" | "accent" | "neutral"; label: string; icon: React.ReactNode }> = {
  merged: { tone: "green", label: "merged", icon: <Check className="h-[15px] w-[15px]" strokeWidth={1.7} /> },
  task: { tone: "accent", label: "task", icon: <SquareDashed className="h-[15px] w-[15px]" strokeWidth={1.7} /> },
  review: { tone: "amber", label: "review", icon: <ShieldCheck className="h-[15px] w-[15px]" strokeWidth={1.7} /> },
  analysis: { tone: "neutral", label: "analysis", icon: <ChartLine className="h-[15px] w-[15px]" strokeWidth={1.7} /> },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await auth();
  const firstName = (session?.user?.name ?? "there").split(" ")[0];
  const { projects, activity, stats } = store();

  return (
    <div className="pad-screen">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-card-lg border border-border bg-panel px-7 py-[26px] after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(900px_240px_at_8%_-40%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)]">
        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Workspace</div>
        <CircuitTraces className="pointer-events-none absolute -right-6 -top-8 h-[210px] w-[440px] text-[color-mix(in_srgb,var(--brand-cyan)_55%,var(--accent))] opacity-[0.08]" />
        <h2 className="relative text-[23px] font-bold tracking-tight">
          {greeting()}, <span className="brand-gradient-text">{firstName}</span>.
        </h2>
        <p className="relative mt-1.5 max-w-[560px] text-txt2">
          One unified system for building, reviewing, and shipping software. Helix indexed{" "}
          {stats.repositories} repositories and has {stats.tasksReady} tasks ready for your review.
        </p>
        <DashboardActions />
        <div className="relative mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { n: String(stats.repositories), l: "Active repositories" },
            { n: String(stats.tasksReady), l: "Tasks awaiting review", up: "ready" },
            { n: `${stats.coverage}%`, l: "Test coverage" },
            { n: String(stats.securityFindings), l: "Security findings" },
          ].map((stat) => (
            <div key={stat.l} className="rounded-card border border-border bg-panel px-4 py-3.5">
              <div className="flex items-baseline gap-1.5 text-[21px] font-bold tracking-tight">
                {stat.n}
                {stat.up && <span className="text-[11px] font-semibold text-ok">{stat.up}</span>}
              </div>
              <div className="mt-1 h-[2px] w-6 rounded-full brand-gradient-fill opacity-80" />
              <div className="mt-1 text-[11.5px] text-txt2">{stat.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Projects */}
      <div className="mb-3 mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent projects</h3>
      </div>
      {projects.length === 0 ? (
        <Card className="p-8 text-center text-sm text-txt3">No projects yet — import a repository to begin.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.slice(0, 6).map((p) => (
            <Link key={p.id} href={p.indexedAt ? `/editor?project=${encodeURIComponent(p.id)}` : `/analysis?project=${encodeURIComponent(p.id)}`} className="block">
              <Card className="cursor-pointer p-4 transition-all duration-150 hover:-translate-y-px hover:border-accent">
                <div className="mb-3 flex items-center gap-2.5">
                  <ProjectLogos language={p.language} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">{p.name}</div>
                    <div className="truncate font-mono text-[11px] text-txt3">{p.repoUrl}</div>
                  </div>
                </div>
                <div className="text-xs text-txt2">{p.description}</div>
                <div className="mt-3 h-1 overflow-hidden rounded bg-panel3">
                  <i className="brand-gradient-fill block h-full" style={{ width: `${p.progress}%` }} />
                </div>
                <div className="mt-[11px] flex items-center gap-2.5 text-[11.5px] text-txt2">
                  <span>{p.language}</span>
                  <span className="text-txt3">· {p.files.toLocaleString()} files</span>
                  <Pill tone={healthPill[p.health].tone} className="ml-auto">
                    {healthPill[p.health].label}
                  </Pill>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Activity */}
      <div className="mb-3 mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Activity</h3>
      </div>
      <Card>
        {activity.length === 0 && <div className="p-8 text-center text-sm text-txt3">No activity yet.</div>}
        {activity.slice(0, 8).map((item, i) => {
          const meta = activityMeta[item.kind];
          return (
            <div
              key={item.id}
              className={`flex items-center gap-[11px] px-4 py-[11px] text-[12.5px] ${
                i < Math.min(activity.length, 8) - 1 ? "border-b border-border" : ""
              }`}
            >
              <span className="shrink-0 text-txt3">{meta.icon}</span>
              <span className="min-w-0">
                <Pill tone={meta.tone}>{meta.label}</Pill>
                <span className="text-txt2">&nbsp; {item.text} </span>
                <b className="font-semibold text-txt">{item.highlight}</b>
              </span>
              <span className="ml-auto whitespace-nowrap text-[11.5px] text-txt3">{timeAgo(item.at)}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
