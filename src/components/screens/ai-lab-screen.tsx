"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Hammer, ArrowRight, GraduationCap, Check } from "lucide-react";
import type { LessonManifest } from "@/lib/lessons/types";

/* The AI Lab hub: two ways to learn — guided Lessons (read + train, step by
 * step) and Studios (build a model yourself on a workbench). Each is its own
 * section you click into. */

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
      ? "Lessons coming soon"
      : doneCount > 0
        ? `${doneCount} of ${total} done`
        : anyInProgress
          ? "In progress"
          : `${total} lessons · start from zero`;

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Learn</div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">AI Lab</h1>
          <Brain className="h-5 w-5 text-txt3" strokeWidth={1.7} />
        </div>
        <p className="mt-1 max-w-[620px] text-[13px] text-txt2">
          Learn how AI really works — hands-on, no code. Pick a path: follow{" "}
          <span className="text-txt">guided lessons</span>, or jump in and{" "}
          <span className="text-txt">build a model yourself</span>.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <SectionCard
            href="/lab/lessons"
            icon={<GraduationCap className="h-5 w-5 text-accent" strokeWidth={1.8} />}
            title="Lessons"
            desc="Guided, hands-on lessons that teach AI one small step at a time. Each ends with you training a real model."
            meta={lessonsMeta}
            metaIcon={doneCount > 0 ? <Check className="h-3 w-3 text-ok" /> : undefined}
          />
          <SectionCard
            href="/lab/studio"
            icon={<Hammer className="h-5 w-5 text-accent" strokeWidth={1.8} />}
            title="Studios"
            desc="Don't just read about it — build it. Grow a decision tree, train a network, and more on an interactive workbench."
            meta="Build it yourself"
            badge="New"
          />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  href,
  icon,
  title,
  desc,
  meta,
  metaIcon,
  badge,
}: {
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
      className="group flex h-full flex-col rounded-card border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_9%,transparent)] to-transparent p-5 shadow-card transition-all duration-150 hover:-translate-y-px hover:border-accent"
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
