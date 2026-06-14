"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Brain, Boxes, GitBranch, LineChart, Globe, Joystick, Bot, Hammer, ArrowRight, Clock, Check, GraduationCap } from "lucide-react";
import type { LessonManifest } from "@/lib/lessons/types";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

/* The AI Lab gallery: pick a lesson, learn AI by training a real model. Each
 * card is a self-contained guided flow — no code, no setup. */

const ICONS: Record<string, typeof Sparkles> = { Sparkles, Brain, Boxes, GitBranch, LineChart, Globe, Joystick, Bot };

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

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Learn</div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">AI Lab</h1>
          <Brain className="h-5 w-5 text-txt3" strokeWidth={1.7} />
        </div>
        <p className="mt-1 max-w-[620px] text-[13px] text-txt2">
          Learn how AI really works by <span className="text-txt">training your own models</span> — hands-on,
          step by step, no code. Pick a lesson and go.
        </p>

        {/* Studios — the hands-on hero: pick a concept and build it on a workbench. */}
        <Link
          href="/lab/studio"
          className="mt-5 flex items-center gap-3.5 rounded-card border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_12%,transparent)] to-transparent p-4 transition-all duration-150 hover:-translate-y-px hover:border-accent"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-hl">
            <Hammer className="h-5 w-5 text-accent" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[14.5px] font-semibold text-txt">
              Studios <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-accent-ink">New</span>
            </span>
            <span className="mt-0.5 block text-[12.5px] text-txt2">
              Don&apos;t just read about it — <span className="text-txt">build it</span>. Grow a decision tree, train a
              network, and more on an interactive workbench.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-accent" />
        </Link>

        {lessons.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-txt3">No lessons yet — check back soon.</Card>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lessons.map((l) => {
              const Icon = ICONS[l.icon] ?? Sparkles;
              const st = status[l.id];
              return (
                <li key={l.id}>
                  <Link
                    href={`/lab/${l.id}`}
                    className="block h-full rounded-card border border-border bg-panel p-5 shadow-card transition-all duration-150 hover:-translate-y-px hover:border-accent"
                  >
                    <div className="mb-3 flex items-center gap-2.5">
                      <span className="grid h-10 w-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
                        <Icon className="h-5 w-5 text-accent" strokeWidth={1.8} />
                      </span>
                      {st === "completed" ? (
                        <Pill tone="green" className="inline-flex items-center gap-1">
                          <Check className="h-3 w-3" /> Done
                        </Pill>
                      ) : st === "in_progress" ? (
                        <Pill tone="accent">In progress</Pill>
                      ) : (
                        <Pill tone="neutral" className="capitalize">
                          {l.level}
                        </Pill>
                      )}
                    </div>
                    <div className="text-[15px] font-semibold text-txt">{l.title}</div>
                    {l.authored && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-accent">
                        <GraduationCap className="h-3 w-3" /> from your teacher
                      </span>
                    )}
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-txt2">{l.blurb}</p>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-txt3">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> ~{l.estMinutes} min
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 text-accent">
                        Start <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
