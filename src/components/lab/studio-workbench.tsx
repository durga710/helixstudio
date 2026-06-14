"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Target, Trophy } from "lucide-react";
import type { StudioMeta } from "@/lib/lessons/studios";
import { studioProgressId } from "@/lib/lessons/studios";
import { StudioHost } from "@/components/lab/studios";
import { TutorPanel } from "@/components/lab/tutor-panel";

/* The studio workbench: a consistent frame around a hands-on build loop. The
 * studio component does the building and reports progress toward the goal; the
 * shell shows the goal meter, a "you built it" ribbon, a Start-over, and the
 * AI mentor. Completion persists through the lesson progress API (studio:<id>). */

export function StudioWorkbench({ meta }: { meta: StudioMeta }) {
  const progressId = studioProgressId(meta.id);
  const [pct, setPct] = useState(0);
  const [built, setBuilt] = useState(false);
  const [labState, setLabState] = useState<Record<string, unknown>>({});
  const [resetKey, setResetKey] = useState(0);
  const saved = useRef(false);

  // Reflect a prior "built" so returning students see the badge.
  useEffect(() => {
    fetch(`/api/lab/progress?lessonId=${encodeURIComponent(progressId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.data?.progress?.status === "completed") setBuilt(true);
      })
      .catch(() => {});
  }, [progressId]);

  const onComplete = useCallback(() => {
    setBuilt(true);
    setPct(100);
    if (saved.current) return;
    saved.current = true;
    void fetch("/api/lab/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId: progressId, status: "completed" }),
    }).catch(() => {});
  }, [progressId]);

  const onProgress = useCallback((p: number) => {
    setPct(Math.max(0, Math.min(100, Math.round(p))));
  }, []);

  function startOver() {
    setPct(0);
    setBuilt(false);
    setLabState({});
    saved.current = false;
    setResetKey((k) => k + 1);
  }

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[860px]">
        {/* Header */}
        <div className="mb-3 flex items-center gap-3">
          <Link href="/lab/studio" className="text-txt3 transition-colors hover:text-txt" title="Back to Studios">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="truncate text-[14px] font-bold tracking-tight text-txt">{meta.title}</span>
          {built && (
            <span className="inline-flex items-center gap-1 rounded-full border border-ok bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-ok">
              <Trophy className="h-3 w-3" /> Built
            </span>
          )}
          <button
            onClick={startOver}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Start over
          </button>
        </div>

        {/* Goal meter */}
        <div className="mb-5 flex items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-txt3">
            <Target className="h-3.5 w-3.5 text-accent" /> {meta.goal}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel2">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${built ? "bg-ok" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-9 text-right text-[12px] font-semibold text-txt">{pct}%</span>
        </div>

        {built && (
          <div className="mb-4 flex items-center gap-2 rounded-card border border-ok bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-4 py-2.5 text-[13px] text-txt">
            <Trophy className="h-4 w-4 shrink-0 text-ok" />
            <span>
              You built it! You reached the goal by constructing this yourself — the exact idea real
              {" "}{meta.concept} use. Keep tinkering, or try another studio.
            </span>
          </div>
        )}

        <StudioHost
          key={resetKey}
          studio={meta.id}
          onProgress={onProgress}
          onComplete={onComplete}
          onState={setLabState}
        />

        <p className="mt-3 text-center text-[11.5px] text-txt3">{meta.blurb}</p>
      </div>

      {/* The mentor gets the studio's concept/goal + live build state. */}
      <TutorPanel
        lessonId={progressId}
        stepIndex={0}
        state={{ ...labState, concept: meta.concept, goal: meta.goal }}
      />
    </div>
  );
}
