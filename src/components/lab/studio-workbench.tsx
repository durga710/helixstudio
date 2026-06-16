"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Target, Trophy, BookOpen, Info, Wrench, Check, Play, HelpCircle } from "lucide-react";
import type { StudioMeta } from "@/lib/lessons/studios";
import { studioProgressId } from "@/lib/lessons/studios";
import { StudioHost } from "@/components/lab/studios";
import { TutorPanel } from "@/components/lab/tutor-panel";
import { cn } from "@/lib/utils";

/* The studio workbench: ONE clean, guided build. The shell provides a first-visit
 * intro, an always-on "what's happening" panel (driven by the studio's narration),
 * a glossary, the goal meter + Built badge, and the AI tutor. The studio component
 * does the building and reports progress + a plain-language narration. */

export function StudioWorkbench({
  meta,
  embedded = false,
  onState,
}: {
  meta: StudioMeta;
  /** Hosted inside the AI workspace — drop the page chrome + own tutor; the
   * guide chat is the mentor and gets live state via onState. */
  embedded?: boolean;
  onState?: (s: Record<string, unknown>) => void;
}) {
  const progressId = studioProgressId(meta.id);
  const [pct, setPct] = useState(0);
  const [built, setBuilt] = useState(false);
  const [labState, setLabState] = useState<Record<string, unknown>>({});
  const [resetKey, setResetKey] = useState(0);
  const [wordsOpen, setWordsOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const saved = useRef(false);

  const introKey = `helix.studio.${meta.id}.seenIntro`;
  const glossary = meta.glossary ?? [];
  const narration = typeof labState.narration === "string" ? (labState.narration as string) : null;

  const reportState = useCallback(
    (s: Record<string, unknown>) => {
      setLabState(s);
      onState?.({ ...s, concept: meta.concept, goal: meta.goal });
    },
    [onState, meta.concept, meta.goal],
  );

  // First visit → show the intro overlay (once; re-openable via "How it works").
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount read of localStorage
      if (!localStorage.getItem(introKey)) setShowIntro(true);
    } catch {
      /* no storage — skip */
    }
  }, [introKey]);

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
    setBuilt(false);
    saved.current = false;
    setPct(0);
    setLabState({});
    setResetKey((k) => k + 1);
  }

  function closeIntro() {
    setShowIntro(false);
    try {
      localStorage.setItem(introKey, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={embedded ? "" : "pad-screen"}>
      <div className={embedded ? "" : "mx-auto max-w-[860px]"}>
        {/* Header */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {!embedded && (
            <Link href="/academy/studio" className="text-txt3 transition-colors hover:text-txt" title="Back to Studios">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <span className="truncate text-[14px] font-bold tracking-tight text-txt">{meta.title}</span>
          {built && (
            <span className="inline-flex items-center gap-1 rounded-full border border-ok bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-ok">
              <Trophy className="h-3 w-3" /> Built
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowIntro(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <HelpCircle className="h-3.5 w-3.5" /> How it works
            </button>
            {glossary.length > 0 && (
              <button
                onClick={() => setWordsOpen((o) => !o)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                  wordsOpen ? "border-accent bg-panel2 text-txt" : "border-border2 bg-panel2 text-txt2 hover:border-accent hover:text-txt",
                )}
              >
                <BookOpen className="h-3.5 w-3.5" /> Words
              </button>
            )}
            <button
              onClick={startOver}
              className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </button>
          </div>
        </div>

        {/* Goal meter */}
        <div className="mb-4 flex items-center gap-2.5">
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
              {" "}{meta.concept} use. Press Start over to try it again, or pick another studio.
            </span>
          </div>
        )}

        {/* Glossary panel */}
        {wordsOpen && glossary.length > 0 && (
          <div className="mb-4 rounded-card border border-border bg-panel2 p-4">
            <div className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-txt">
              <BookOpen className="h-4 w-4 text-accent" /> Words to know
            </div>
            <dl className="grid gap-2.5 sm:grid-cols-2">
              {glossary.map((g) => (
                <div key={g.term} className="rounded-[10px] border border-border2 bg-panel px-3 py-2">
                  <dt className="text-[12.5px] font-semibold text-txt">{g.term}</dt>
                  <dd className="mt-0.5 text-[12px] leading-relaxed text-txt3">{g.def}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <StudioHost key={resetKey} studio={meta.id} onProgress={onProgress} onComplete={onComplete} onState={reportState} />

        {/* What's happening — always-on plain-language narration */}
        {narration && (
          <div className="mt-3 flex items-start gap-2.5 rounded-card border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] px-3.5 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent">What&apos;s happening</div>
              <p className="text-[13px] leading-relaxed text-txt2">{narration}</p>
            </div>
          </div>
        )}

        <p className="mt-3 text-center text-[11.5px] text-txt3">{meta.blurb}</p>
      </div>

      {/* Standalone: the floating tutor is the mentor. Embedded: the AI-workspace
          guide chat is the mentor instead, fed live state via onState. */}
      {!embedded && (
        <TutorPanel lessonId={progressId} stepIndex={0} state={{ ...labState, concept: meta.concept, goal: meta.goal }} />
      )}

      {showIntro && <IntroOverlay meta={meta} onStart={closeIntro} />}
    </div>
  );
}

/* First-visit framing — what this studio is + what you'll get — so nobody is
 * dropped in cold. Mirrors the lesson intro card. */
function IntroOverlay({ meta, onStart }: { meta: StudioMeta; onStart: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 backdrop-blur-sm">
      <div className="mx-auto my-auto w-full max-w-[560px] rounded-card border border-border bg-panel p-7 shadow-card">
        <div className="inline-flex items-center gap-2 rounded-full border border-border2 bg-panel2 px-2.5 py-1 text-[11px] capitalize text-txt3">
          <Wrench className="h-3 w-3 text-accent" /> Studio · {meta.level}
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">{meta.title}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-txt2">{meta.tagline ?? meta.blurb}</p>

        {meta.objectives && meta.objectives.length > 0 && (
          <div className="mt-4 rounded-[12px] border border-border2 bg-panel2 p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-txt">
              <Target className="h-4 w-4 text-accent" /> You&apos;ll get:
            </div>
            <ul className="space-y-2">
              {meta.objectives.map((o, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-txt2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-[12px] leading-relaxed text-txt3">
          You&apos;ll build it step by step. As you go, the <span className="text-txt2">What&apos;s happening</span> panel
          explains what you&apos;re doing in plain words, and you can tap <span className="text-txt2">Words</span> for any term.
        </p>

        <button
          onClick={onStart}
          className="mt-5 inline-flex items-center gap-2 rounded-[10px] border-none bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink transition hover:brightness-110"
        >
          <Play className="h-4 w-4" /> Start building
        </button>
      </div>
    </div>
  );
}
