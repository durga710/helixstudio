"use client";

import Link from "next/link";
import { Sparkles, Brain, Boxes, GitBranch, LineChart, ArrowRight, Clock } from "lucide-react";
import type { LessonManifest } from "@/lib/lessons/types";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

/* The AI Lab gallery: pick a lesson, learn AI by training a real model. Each
 * card is a self-contained guided flow — no code, no setup. */

const ICONS: Record<string, typeof Sparkles> = { Sparkles, Brain, Boxes, GitBranch, LineChart };

export function AILabScreen({ lessons }: { lessons: LessonManifest[] }) {
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

        {lessons.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-txt3">No lessons yet — check back soon.</Card>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lessons.map((l) => {
              const Icon = ICONS[l.icon] ?? Sparkles;
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
                      <Pill tone="neutral" className="capitalize">
                        {l.level}
                      </Pill>
                    </div>
                    <div className="text-[15px] font-semibold text-txt">{l.title}</div>
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
