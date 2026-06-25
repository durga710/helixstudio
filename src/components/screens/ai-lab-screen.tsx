"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Hammer, ArrowRight, GraduationCap, Check, Award, Lock, Trophy } from "lucide-react";
import type { LessonManifest } from "@/lib/lessons/types";

/* Progression badges — earned by completing modules. Derived purely from the
 * completed count (no extra storage), so they update as the student progresses. */
const BADGES = [
  { key: "beginner", label: "Beginner", need: 1, icon: Award },
  { key: "practitioner", label: "Practitioner", need: 4, icon: GraduationCap },
  { key: "expert", label: "Expert", need: 8, icon: Brain },
  { key: "architect", label: "AI Architect", need: 12, icon: Trophy },
] as const;

/* The AI Academy hub: two ways to learn — guided Modules (play + train, step by
 * step, with an AI coach) and Studios (build a model yourself on a workbench).
 * Each is its own section you click into. */

export function AILabScreen({ lessons }: { lessons: LessonManifest[] }) {
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/lab/progress")
      .then((r) => r.json())
      .then((j) => {
        const rows = (j?.data?.progress ?? []) as { lessonId: string; status: string }[];
        if (alive) setStatus(Object.fromEntries(rows.map((r) => [r.lessonId, r.status])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const total = lessons.length;
  const doneCount = lessons.filter((l) => status[l.id] === "completed").length;
  const anyInProgress = lessons.some((l) => status[l.id] === "in_progress");
  const lessonsMeta =
    total === 0
      ? "Modules coming soon"
      : doneCount > 0
        ? `${doneCount} of ${total} done`
        : anyInProgress
          ? "In progress"
          : `${total} modules · start from zero`;

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[1000px]">
        <div className="relative overflow-hidden rounded-card-lg border border-border2 bg-panel p-7 lit-2 sm:p-9">
          <div className="aurora-bg" aria-hidden />
          <div className="relative z-10">
            <div className="text-eyebrow text-accent">Learn</div>
            <div className="mt-2 flex items-center gap-2.5">
              <h1 className="text-display brand-gradient-text">AI Academy</h1>
              <Brain className="h-7 w-7 text-accent" strokeWidth={1.7} />
            </div>
            <p className="mt-2.5 max-w-[620px] text-[13.5px] leading-relaxed text-txt2">
              Learn how AI really works — by playing, not reading. Pick a path: work through{" "}
              <span className="text-txt">game modules</span> with an AI coach beside you, or jump in and{" "}
              <span className="text-txt">build a model yourself</span>.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SectionCard
            index={0}
            href="/academy/lessons"
            icon={<GraduationCap className="h-5 w-5 text-accent" strokeWidth={1.8} />}
            title="Modules"
            desc="Play-to-learn game modules that teach AI one small step at a time — train a puppy, escape a maze, bust bias. An AI coach guides you the whole way."
            meta={lessonsMeta}
            metaIcon={doneCount > 0 ? <Check className="h-3 w-3 text-ok" /> : undefined}
          />
          <SectionCard
            index={1}
            href="/academy/studio"
            icon={<Hammer className="h-5 w-5 text-accent" strokeWidth={1.8} />}
            title="Studios"
            desc="Don't just read about it — build it. Grow a decision tree, train a network, and more on an interactive workbench."
            meta="Build it yourself"
            badge="New"
          />
        </div>

        <BadgeRail doneCount={doneCount} total={total} />
      </div>
    </div>
  );
}

function SectionCard({
  index,
  href,
  icon,
  title,
  desc,
  meta,
  metaIcon,
  badge,
}: {
  index: number;
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  meta: string;
  metaIcon?: React.ReactNode;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      style={{ animationDelay: `${index * 55}ms` }}
      className="rise group flex h-full flex-col rounded-card border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_9%,transparent)] to-transparent p-5 lit hover-lift"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-hl">
          {icon}
        </span>
        <span className="flex items-center gap-2 text-[16px] font-semibold text-txt">
          {title}
          {badge && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-accent-ink">
              {badge}
            </span>
          )}
        </span>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="text-[12.5px] leading-relaxed text-txt2">{desc}</p>
      <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-txt3">
        {metaIcon}
        {meta}
      </div>
    </Link>
  );
}

/* Your-rank strip: which badges you've earned and what's next. */
function BadgeRail({ doneCount, total }: { doneCount: number; total: number }) {
  const earned = BADGES.filter((b) => doneCount >= b.need);
  const rank = earned.length ? earned[earned.length - 1] : null;
  const next = BADGES.find((b) => doneCount < b.need) ?? null;

  return (
    <div className="mt-6 rounded-card border border-border bg-panel p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Award className="h-4 w-4 text-accent" strokeWidth={1.9} />
        <span className="text-[13.5px] font-semibold text-txt">Your badges</span>
        <span className="text-[12px] text-txt3">· {doneCount} of {total} modules done</span>
        {rank ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2.5 py-0.5 text-[11.5px] font-semibold text-accent">
            <rank.icon className="h-3.5 w-3.5" /> {rank.label}
          </span>
        ) : (
          <span className="ml-auto text-[11.5px] text-txt3">Finish a module to earn your first badge</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {BADGES.map((b) => {
          const unlocked = doneCount >= b.need;
          const Icon = b.icon;
          return (
            <div
              key={b.key}
              className={`flex flex-col items-center gap-1.5 rounded-[12px] border p-3 text-center transition-colors ${unlocked ? "glass" : ""}`}
              style={
                unlocked
                  ? { borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" }
                  : { borderColor: "var(--border)", opacity: 0.7 }
              }
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-full border"
                style={unlocked ? { borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)", color: "var(--accent)" } : { borderColor: "var(--border2)", color: "var(--txt3)" }}
              >
                {unlocked ? <Icon className="h-5 w-5" strokeWidth={1.9} /> : <Lock className="h-4 w-4" />}
              </span>
              <span className={`text-[12px] font-semibold ${unlocked ? "text-txt" : "text-txt3"}`}>{b.label}</span>
              <span className="text-[10.5px] text-txt3">{unlocked ? "Earned" : `${b.need} modules`}</span>
            </div>
          );
        })}
      </div>

      {next && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-txt3">
            <span>Next: <span className="text-txt2">{next.label}</span></span>
            <span className="tabular-nums">{doneCount}/{next.need}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.min(100, (doneCount / next.need) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
