"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StepForward, FastForward, RotateCcw } from "lucide-react";
import type { WidgetProps } from "./index";
import { getDataset } from "@/components/lab/datasets";

/*
 * ErrorChart — "watch the mistakes fall." Each training round runs one perceptron
 * pass and plots how many items it still gets wrong as a BAR in a growing chart.
 * The bars shrink toward zero, making "learning = fewer mistakes each round" a
 * picture, not a scatter. A chart modality, distinct from the other widgets.
 * Completes when the mistakes bottom out (plateau) or after enough rounds.
 */

const LR = 0.08;
const REVEAL_INIT = { w1: 1, w2: 1, bias: -3 };
const MAX_BARS = 16;

interface Weights {
  w1: number;
  w2: number;
  bias: number;
}

export function ErrorChart({ config, onComplete, onState }: WidgetProps) {
  const ds = getDataset(typeof config?.dataset === "string" ? config.dataset : "boundary");
  const fx = ds.featureNames[0];
  const fy = ds.featureNames[1];

  const wrongCountOf = useCallback(
    (wt: Weights) => {
      let bad = 0;
      for (const p of ds.points) {
        const pred = wt.w1 * p.features[fx] + wt.w2 * p.features[fy] + wt.bias > 0 ? 1 : 0;
        if (pred !== ds.classes.indexOf(p.label)) bad++;
      }
      return bad;
    },
    [ds, fx, fy],
  );
  const onePass = useCallback(
    (wt: Weights): Weights => {
      const cur = { ...wt };
      for (const p of ds.points) {
        const x = p.features[fx];
        const y = p.features[fy];
        const err = ds.classes.indexOf(p.label) - (cur.w1 * x + cur.w2 * y + cur.bias > 0 ? 1 : 0);
        cur.w1 += LR * err * x;
        cur.w2 += LR * err * y;
        cur.bias += LR * err;
      }
      return cur;
    },
    [ds, fx, fy],
  );

  const wt = useRef<Weights>(REVEAL_INIT);
  const [history, setHistory] = useState<number[]>(() => [wrongCountOf(REVEAL_INIT)]);
  const [auto, setAuto] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const completed = useRef(false);

  const rounds = history.length - 1;
  const maxWrong = Math.max(...history, 1);
  const last = history[history.length - 1];
  // Plateaued: no improvement across the last two rounds (and we've done a few).
  const plateaued = history.length >= 4 && last === history[history.length - 2] && last === history[history.length - 3];

  const trainRound = useCallback(() => {
    wt.current = onePass(wt.current);
    setHistory((h) => [...h, wrongCountOf(wt.current)]);
  }, [onePass, wrongCountOf]);

  useEffect(() => {
    onState?.({ rounds, mistakes: last });
    if (!completed.current && (plateaued || last === 0 || rounds >= 12)) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  // Auto mode: keep training until it plateaus.
  useEffect(() => {
    if (!auto) return;
    timer.current = setInterval(() => {
      if (plateaued || last === 0 || rounds >= 14) {
        if (timer.current) clearInterval(timer.current);
        setAuto(false);
        return;
      }
      trainRound();
    }, 280);
    return () => void (timer.current && clearInterval(timer.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, history]);

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setAuto(false);
    completed.current = false;
    wt.current = REVEAL_INIT;
    setHistory([wrongCountOf(REVEAL_INIT)]);
  }

  const bars = history.slice(-MAX_BARS);
  const chartH = 120;

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-2 flex items-center gap-x-4 text-[12px] text-txt3">
        <span>round: <b className="text-txt2">{rounds}</b></span>
        <span>mistakes now: <b style={{ color: last === 0 ? "var(--ok)" : "var(--bad)" }}>{last}</b></span>
        <span className="ml-auto">started at {history[0]}</span>
      </div>

      {/* Bar chart of mistakes per round */}
      <div className="rounded-md border border-border2 bg-panel p-3">
        <div className="flex items-end justify-start gap-1.5" style={{ height: chartH }}>
          {bars.map((m, i) => {
            const h = (m / maxWrong) * chartH;
            const t = m / maxWrong; // 1 = lots of mistakes, 0 = none
            const color = `color-mix(in srgb, var(--bad) ${Math.round(t * 100)}%, var(--ok))`;
            return (
              <div key={i} className="flex w-5 flex-col items-center justify-end" style={{ height: chartH }}>
                <span className="mb-0.5 text-[9px] text-txt3">{m}</span>
                <div
                  className="w-full rounded-t transition-[height] duration-200"
                  style={{ height: Math.max(2, h), background: color }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 text-center text-[10px] text-txt3">each bar = mistakes after that training round</div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <button
          onClick={trainRound}
          disabled={auto || plateaued || last === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-50"
        >
          <StepForward className="h-3.5 w-3.5" /> Train a round
        </button>
        <button
          onClick={() => setAuto(true)}
          disabled={auto || plateaued || last === 0}
          className="inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
        >
          <FastForward className="h-3.5 w-3.5" /> {auto ? "Training…" : "Auto"}
        </button>
      </div>

      <p className={`mt-2.5 text-[11.5px] leading-relaxed ${last === 0 || plateaued ? "text-ok" : "text-txt3"}`}>
        {last === 0
          ? "Zero mistakes — the bars hit the floor. Every round just nudged the line to be a little less wrong."
          : plateaued
            ? "The bars stopped shrinking — that's as good as one straight line gets on this data."
            : "Press Train a round and watch the mistake bars drop. Fewer mistakes each round = learning."}
      </p>
    </div>
  );
}
