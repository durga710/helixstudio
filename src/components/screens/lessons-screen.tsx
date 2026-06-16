"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Brain, Boxes, GitBranch, LineChart, Globe, Joystick, Bot, ArrowLeft, ArrowRight, Clock, Check, GraduationCap } from "lucide-react";
import type { LessonManifest } from "@/lib/lessons/types";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

/* The Lessons gallery: pick a guided lesson and learn AI by training a real
 * model, one small step at a time. Reached from the AI Lab hub (/lab). */

const ICONS: Record<string, typeof Sparkles> = { Sparkles, Brain, Boxes, GitBranch, LineChart, Globe, Joystick, Bot };

export function LessonsScreen({ lessons }: { lessons: LessonManifest[] }) {
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
        <Link href="/academy" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-txt3 transition-colors hover:text-txt">
          <ArrowLeft className="h-3.5 w-3.5" /> AI Academy
        </Link>
        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Learn</div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Modules</h1>
          <GraduationCap className="h-5 w-5 text-txt3" strokeWidth={1.7} />
        </div>
        <p className="mt-1 max-w-[640px] text-[13px] text-txt2">
          Start from zero and learn how AI really works — <span className="text-txt">play-to-learn, one small step
          at a time</span>, no code. Each module is a little game, with an AI coach beside you.
        </p>

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
                    href={`/academy/${l.id}`}
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
                        {st === "in_progress" ? "Continue" : st === "completed" ? "Revisit" : "Start"}{" "}
                        <ArrowRight className="h-3 w-3" />
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
