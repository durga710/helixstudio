"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Sparkles, Cpu, CheckCircle2, Rocket, RotateCcw, Star } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * Pipeline — the AI Factory: machine learning is a PROCESS, not one step. The
 * learner runs a product through Collect → Clean → Train → Test → Deploy, making
 * one choice per stage; choices interact (cheap data + skipping cleaning hurts
 * later) and add up to a launch score that decides how the product does in the
 * wild. Deterministic — no AI spend. Completes once the product is deployed.
 */

interface Choice { label: string; pts: number; tag: string }
interface Stage { key: string; title: string; icon: React.ComponentType<{ className?: string }>; prompt: string; choices: [Choice, Choice] }

const STAGES: Stage[] = [
  {
    key: "collect", title: "Collect data", icon: Database,
    prompt: "How will you gather your training examples?",
    choices: [
      { label: "Lots of cheap, random data", pts: 10, tag: "cheap" },
      { label: "Less, but high-quality data", pts: 25, tag: "quality" },
    ],
  },
  {
    key: "clean", title: "Clean data", icon: Sparkles,
    prompt: "The raw data has errors. What now?",
    choices: [
      { label: "Skip it — ship faster", pts: 0, tag: "skip" },
      { label: "Clean it carefully", pts: 25, tag: "clean" },
    ],
  },
  {
    key: "train", title: "Train model", icon: Cpu,
    prompt: "Pick a model to train.",
    choices: [
      { label: "A giant, fancy model", pts: 12, tag: "giant" },
      { label: "A right-sized model", pts: 25, tag: "right" },
    ],
  },
  {
    key: "test", title: "Test model", icon: CheckCircle2,
    prompt: "Before launch…",
    choices: [
      { label: "Skip testing — looks fine", pts: 0, tag: "skip" },
      { label: "Test on fresh, unseen data", pts: 25, tag: "test" },
    ],
  },
];

export function Pipeline({ onComplete, onState }: WidgetProps) {
  const [picks, setPicks] = useState<Record<string, Choice>>({});
  const [deployed, setDeployed] = useState(false);
  const completed = useRef(false);

  const idx = STAGES.findIndex((s) => !picks[s.key]);
  const stageIdx = idx === -1 ? STAGES.length : idx;
  const allChosen = stageIdx === STAGES.length;

  const score = useMemo(() => {
    let s = Object.values(picks).reduce((a, c) => a + c.pts, 0);
    // interaction: cheap data AND skipped cleaning compounds the damage
    if (picks.collect?.tag === "cheap" && picks.clean?.tag === "skip") s -= 12;
    // a giant model on dirty/cheap data overfits
    if (picks.train?.tag === "giant" && (picks.collect?.tag === "cheap" || picks.clean?.tag === "skip")) s -= 8;
    return Math.max(0, Math.min(100, s));
  }, [picks]);

  const outcome = useMemo(() => {
    if (score >= 85) return { stars: 3, tone: "ok", text: "Users love it. Predictions hold up on real-world data — a healthy product built on a healthy process." };
    if (score >= 60) return { stars: 2, tone: "warn", text: "It works… mostly. A few odd predictions slip through and you're patching issues you could've caught earlier." };
    return { stars: 1, tone: "bad", text: "Trouble in the wild: model drift, weird predictions, complaints. The shortcuts upstream became expensive downstream." };
  }, [score]);

  useEffect(() => {
    onState?.({ stage: STAGES[stageIdx]?.key ?? "deploy", score, deployed });
    if (deployed && !completed.current) { completed.current = true; onComplete(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIdx, score, deployed]);

  function reset() { setPicks({}); setDeployed(false); }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12.5px] leading-relaxed text-txt2">Run your product down the line. Every stage shapes the finish.</p>
        <span className="shrink-0 text-[11.5px] text-txt3">Health: <b className="tabular-nums" style={{ color: score >= 60 ? "var(--ok)" : "var(--warn)" }}>{score}</b></span>
      </div>

      <ol className="space-y-2">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const chosen = picks[s.key];
          const active = i === stageIdx && !deployed;
          const locked = i > stageIdx;
          return (
            <li key={s.key} className="rounded-[10px] border bg-panel p-3" style={{ borderColor: active ? "var(--accent)" : "var(--border)", opacity: locked ? 0.5 : 1 }}>
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-border2 bg-panel2"><Icon className="h-4 w-4 text-accent" /></span>
                <span className="text-[13px] font-semibold text-txt">{i + 1}. {s.title}</span>
                {chosen && <span className="ml-auto text-[11.5px] text-txt3">{chosen.label}</span>}
              </div>
              {active && (
                <div className="mt-2.5">
                  <p className="mb-2 text-[12px] text-txt2">{s.prompt}</p>
                  <div className="flex flex-col gap-1.5 sm:flex-row">
                    {s.choices.map((c) => (
                      <button
                        key={c.tag}
                        onClick={() => setPicks((p) => ({ ...p, [s.key]: c }))}
                        className="flex-1 rounded-[9px] border border-border2 bg-panel2 px-3 py-2 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {allChosen && !deployed && (
        <button onClick={() => setDeployed(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110">
          <Rocket className="h-4 w-4" /> Deploy & monitor
        </button>
      )}

      {deployed && (
        <div className="mt-3 rounded-[10px] border px-3.5 py-3" style={{ borderColor: `color-mix(in srgb, var(--${outcome.tone}) 45%, transparent)` }}>
          <div className="mb-1 flex items-center gap-1">
            {[0, 1, 2].map((n) => (
              <Star key={n} className="h-4 w-4" style={{ color: n < outcome.stars ? "var(--accent)" : "var(--border2)", fill: n < outcome.stars ? "var(--accent)" : "transparent" }} />
            ))}
            <button onClick={reset} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
              <RotateCcw className="h-3.5 w-3.5" /> Run again
            </button>
          </div>
          <p className="text-[12.5px] leading-relaxed text-txt2">{outcome.text}</p>
        </div>
      )}
    </div>
  );
}
