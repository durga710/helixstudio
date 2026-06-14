"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hammer, GitBranch, LineChart, Network, Boxes, Sparkles, ArrowLeft, ArrowRight, Clock, Trophy, Target } from "lucide-react";
import type { StudioMeta } from "@/lib/lessons/studios";
import { studioProgressId } from "@/lib/lessons/studios";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

/* The Studios gallery: pick an ML concept and BUILD it on a workbench. Unlike
 * lessons (read + poke + quiz), each studio is a hands-on construction loop. */

const ICONS: Record<string, typeof Sparkles> = { GitBranch, LineChart, Network, Boxes, Hammer, Sparkles };

export function StudioGalleryScreen({ studios }: { studios: StudioMeta[] }) {
  const [built, setBuilt] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/lab/progress")
      .then((r) => r.json())
      .then((j) => {
        const rows = (j?.data?.progress ?? []) as { lessonId: string; status: string }[];
        if (!alive) return;
        const map: Record<string, boolean> = {};
        for (const r of rows) if (r.status === "completed") map[r.lessonId] = true;
        setBuilt(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[1000px]">
        <Link href="/lab" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-txt3 transition-colors hover:text-txt">
          <ArrowLeft className="h-3.5 w-3.5" /> AI Lab
        </Link>
        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Build</div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Studios</h1>
          <Hammer className="h-5 w-5 text-txt3" strokeWidth={1.7} />
        </div>
        <p className="mt-1 max-w-[640px] text-[13px] text-txt2">
          Pick a concept and <span className="text-txt">build it yourself</span> — grow it piece by piece on a
          workbench and watch your model get smarter. No reading, no quiz: you construct the real thing.
        </p>

        {studios.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-txt3">No studios yet — check back soon.</Card>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...studios].sort((a, b) => a.order - b.order).map((s) => {
              const Icon = ICONS[s.icon] ?? Hammer;
              const isBuilt = built[studioProgressId(s.id)];
              return (
                <li key={s.id}>
                  <Link
                    href={`/lab/studio/${s.id}`}
                    className="block h-full rounded-card border border-border bg-panel p-5 shadow-card transition-all duration-150 hover:-translate-y-px hover:border-accent"
                  >
                    <div className="mb-3 flex items-center gap-2.5">
                      <span className="grid h-10 w-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
                        <Icon className="h-5 w-5 text-accent" strokeWidth={1.8} />
                      </span>
                      {isBuilt ? (
                        <Pill tone="green" className="inline-flex items-center gap-1">
                          <Trophy className="h-3 w-3" /> Built
                        </Pill>
                      ) : (
                        <Pill tone="neutral" className="capitalize">
                          {s.level}
                        </Pill>
                      )}
                    </div>
                    <div className="text-[15px] font-semibold text-txt">{s.title}</div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-txt2">{s.blurb}</p>
                    <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-txt3">
                      <Target className="mt-0.5 h-3 w-3 shrink-0 text-accent" /> {s.goal}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-txt3">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> ~{s.estMinutes} min
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 text-accent">
                        {isBuilt ? "Build again" : "Build it"} <ArrowRight className="h-3 w-3" />
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
