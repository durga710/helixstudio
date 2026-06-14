"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, RotateCcw, ArrowRight, PartyPopper, HelpCircle } from "lucide-react";
import type { GameMeta } from "@/lib/lessons/games";
import { gameProgressId } from "@/lib/lessons/games";
import { GameHost } from "@/components/lab/games";

/* The game shell: a tiny, kid-first frame around a game. Picture "how to play"
 * on first visit, a level tracker, and a big celebration when you win a level —
 * with as little text as possible. Progress persists via /api/lab/progress
 * (game:<id>, currentStep = your level). */
export function GameShell({ meta }: { meta: GameMeta }) {
  const pid = gameProgressId(meta.id);
  const total = meta.levels.length;
  const [level, setLevel] = useState(0);
  const [howTo, setHowTo] = useState(false);
  const [won, setWon] = useState(false);
  const resumed = useRef(false);
  const howToKey = `helix.game.${meta.id}.howto`;

  // Resume the player's level (once).
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    fetch(`/api/lab/progress?lessonId=${encodeURIComponent(pid)}`)
      .then((r) => r.json())
      .then((j) => {
        const step = j?.data?.progress?.currentStep;
        if (typeof step === "number" && step > 0 && step < total) setLevel(step);
      })
      .catch(() => {});
  }, [pid, total]);

  // First visit → show "how to play".
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount read
      if (!localStorage.getItem(howToKey)) setHowTo(true);
    } catch {
      /* no storage */
    }
  }, [howToKey]);

  const isLast = level >= total - 1;

  const onWin = useCallback(() => {
    setWon(true);
    const nextStep = Math.min(level + 1, total - 1);
    void fetch("/api/lab/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId: pid, currentStep: nextStep, status: isLast ? "completed" : "in_progress" }),
    }).catch(() => {});
  }, [level, total, pid, isLast]);

  function nextLevel() {
    setWon(false);
    if (!isLast) setLevel((l) => l + 1);
  }
  function replay() {
    setWon(false);
    setLevel(0);
  }
  function closeHowTo() {
    setHowTo(false);
    try {
      localStorage.setItem(howToKey, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[680px]">
        {/* Header */}
        <div className="mb-3 flex items-center gap-3">
          <Link href="/lab" className="text-txt3 transition-colors hover:text-txt" title="Back to AI Lab">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-[15px] font-bold tracking-tight text-txt">
            {meta.emoji} {meta.title}
          </span>
          <button
            onClick={() => setHowTo(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            <HelpCircle className="h-3.5 w-3.5" /> How to play
          </button>
        </div>

        {/* Level tracker */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[12px] font-semibold text-txt2">Level {level + 1}</span>
          <span className="text-[12px] text-txt3">· {meta.levels[level].title}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {meta.levels.map((_, i) => (
              <span
                key={i}
                className="h-2 rounded-full transition-all"
                style={{ width: i === level ? 20 : 8, background: i < level ? "var(--ok)" : i === level ? "var(--accent)" : "var(--border2)" }}
              />
            ))}
          </div>
        </div>

        {/* The game */}
        <GameHost key={level} game={meta.id} level={meta.levels[level]} onWin={onWin} />
      </div>

      {/* How to play */}
      {howTo && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 backdrop-blur-sm">
          <div className="mx-auto my-auto w-full max-w-[420px] rounded-card border border-border bg-panel p-7 text-center shadow-card">
            <div className="text-5xl">{meta.emoji}</div>
            <h1 className="mt-2 text-[20px] font-bold tracking-tight">{meta.title}</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-txt2">{meta.tagline}</p>
            <ul className="mt-5 space-y-3 text-left">
              {meta.howTo.map((s, i) => (
                <li key={i} className="flex items-center gap-3 rounded-[12px] border border-border2 bg-panel2 px-3.5 py-2.5">
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="text-[14px] font-medium text-txt">{s.text}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={closeHowTo}
              className="mt-6 inline-flex items-center gap-2 rounded-[12px] border-none bg-accent px-6 py-3 text-[15px] font-bold text-accent-ink transition hover:brightness-110"
            >
              <Play className="h-5 w-5" /> Let&apos;s play!
            </button>
          </div>
        </div>
      )}

      {/* Win celebration */}
      {won && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          {/* cheap confetti — a few bouncing emoji */}
          {["🎉", "⭐", "🎊", "✨", "🏆", "🎈"].map((e, i) => (
            <span
              key={i}
              className="pointer-events-none absolute animate-bounce text-3xl"
              style={{ left: `${10 + i * 15}%`, top: "12%", animationDelay: `${i * 0.12}s` }}
            >
              {e}
            </span>
          ))}
          <div className="w-full max-w-[420px] rounded-card border border-border bg-panel p-7 text-center shadow-card">
            <div className="text-6xl">🤖🎉</div>
            <h1 className="mt-2 text-[22px] font-bold tracking-tight">You taught Robo!</h1>
            <p className="mt-1 text-[13.5px] text-txt2">
              {isLast ? "You finished every level — you're a real AI trainer! 🏆" : `Level ${level + 1} complete. Ready for a trickier one?`}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              {isLast ? (
                <>
                  <Link href="/lab" className="rounded-[10px] border border-border2 bg-panel2 px-4 py-2.5 text-[13px] text-txt2 transition-colors hover:border-accent hover:text-txt">
                    Back to Lab
                  </Link>
                  <button onClick={replay} className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-5 py-2.5 text-[14px] font-bold text-accent-ink transition hover:brightness-110">
                    <RotateCcw className="h-4 w-4" /> Play again
                  </button>
                </>
              ) : (
                <button onClick={nextLevel} className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-6 py-3 text-[15px] font-bold text-accent-ink transition hover:brightness-110">
                  Next level <ArrowRight className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
          <PartyPopper className="mt-4 h-6 w-6 text-accent" />
        </div>
      )}
    </div>
  );
}
