"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, GitBranch, LineChart, Network, Boxes, Hammer, Target, BookOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StudioMeta } from "@/lib/lessons/studios";
import { getStudioMeta } from "@/lib/lessons/studios";
import { StudioWorkbench } from "@/components/lab/studio-workbench";

/* The right pane of the AI workspace: a gallery of studios (+ a row of lessons),
 * or — when one is open (via a click or the guide) — the live workbench embedded. */

export interface LessonCard {
  id: string;
  title: string;
  blurb: string;
  concept: string;
}

const ICONS: Record<string, LucideIcon> = { GitBranch, LineChart, Network, Boxes, Hammer };

export function AiCanvas({
  studios,
  lessons,
  openStudioId,
  onOpenStudio,
  onState,
}: {
  studios: StudioMeta[];
  lessons: LessonCard[];
  openStudioId: string | null;
  onOpenStudio: (id: string | null) => void;
  onState: (s: Record<string, unknown>) => void;
}) {
  const openMeta = openStudioId ? getStudioMeta(openStudioId) : undefined;

  if (openMeta) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <button
          onClick={() => onOpenStudio(null)}
          className="mb-3 inline-flex w-fit items-center gap-1.5 text-[12px] text-txt3 transition-colors hover:text-txt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> all topics
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StudioWorkbench meta={openMeta} embedded onState={onState} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Build it yourself</div>
      <h2 className="mb-3 text-[18px] font-bold tracking-tight text-txt">Studios</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {[...studios].sort((a, b) => a.order - b.order).map((s) => {
          const Icon = ICONS[s.icon] ?? Hammer;
          return (
            <li key={s.id}>
              <button
                onClick={() => onOpenStudio(s.id)}
                className="block h-full w-full rounded-card border border-border bg-panel p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:border-accent"
              >
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
                    <Icon className="h-4 w-4 text-accent" strokeWidth={1.8} />
                  </span>
                  <span className="text-[14px] font-semibold text-txt">{s.title}</span>
                </div>
                <p className="text-[12px] leading-relaxed text-txt2">{s.blurb}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-txt3">
                  <Target className="h-3 w-3 shrink-0 text-accent" /> {s.goal}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {lessons.length > 0 && (
        <>
          <h2 className="mb-3 mt-7 text-[18px] font-bold tracking-tight text-txt">Or read a lesson</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {lessons.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/lab/${l.id}`}
                  className="flex items-center gap-2.5 rounded-card border border-border bg-panel px-3.5 py-2.5 transition-colors hover:border-accent"
                >
                  <BookOpen className="h-4 w-4 shrink-0 text-txt3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-txt">{l.title}</span>
                    <span className="block truncate text-[11px] text-txt3">{l.blurb}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-txt3" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
