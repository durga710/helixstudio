"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scale, Play, RotateCcw, Users } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * BiasBusters — fairness made visible. A scholarship AI was trained on lopsided
 * data: tons of examples from School A, barely any from School B. The learner
 * sees the per-group accuracy gap, adds examples to balance the data, and
 * retrains until the model is fair to both. Deterministic — no AI spend.
 * Teaches: AI repeats the patterns in its data; balanced data → fairer results.
 * Completes once the model is retrained and fair.
 */

const A_COUNT = 1000;
const FAIR = 80; // fairness % needed

export function BiasBusters({ onComplete, onState }: WidgetProps) {
  const [bCount, setBCount] = useState(100);
  const [trained, setTrained] = useState<{ a: number; b: number; fairness: number } | null>(null);
  const completed = useRef(false);

  const ratio = useMemo(() => Math.min(A_COUNT, bCount) / Math.max(A_COUNT, bCount), [bCount]);
  const fairness = Math.round(ratio * 100);
  // Majority group is learned well; minority accuracy scales with its share.
  const accA = 92;
  const accB = Math.round(60 + 32 * ratio);

  useEffect(() => {
    onState?.({ groupB: bCount, fairness, minorityAccuracy: accB, retrained: Boolean(trained) });
    if (trained && trained.fairness >= FAIR && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bCount, fairness, accB, trained]);

  const shown = trained ?? { a: accA, b: 63, fairness: 10 };
  const reaction =
    !trained ? "" :
    trained.fairness >= FAIR ? "The community trusts it now — both schools get a fair shot. 🤝" :
    trained.fairness >= 50 ? "Better, but School B students still lose out more often. Keep balancing." :
    "Unfair: School B is barely represented, so the AI guesses badly for them. 😟";

  const maxBar = A_COUNT;
  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <p className="mb-3 text-[12.5px] leading-relaxed text-txt2">
        A scholarship AI learned from <b className="text-txt">lopsided</b> data. Balance the examples, then retrain — watch fairness rise.
      </p>

      {/* Data balance bars */}
      <div className="space-y-2">
        <DataBar label="School A examples" count={A_COUNT} max={maxBar} color="#3b82f6" />
        <DataBar label="School B examples" count={bCount} max={maxBar} color="#c084fc" />
      </div>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-[11.5px] text-txt2">
          <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Add School B examples</span>
          <span className="tabular-nums text-txt3">{bCount}</span>
        </span>
        <input type="range" min={50} max={1000} step={50} value={bCount} onChange={(e) => { setBCount(parseInt(e.target.value)); setTrained(null); }} className="w-full accent-[var(--accent)]" />
      </label>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => setTrained({ a: accA, b: accB, fairness })} className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110">
          <Play className="h-4 w-4" /> Retrain
        </button>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-txt3">
          <Scale className="h-4 w-4" /> Fairness: <b className="tabular-nums" style={{ color: fairness >= FAIR ? "var(--ok)" : "var(--warn)" }}>{fairness}%</b>
        </span>
        {trained && (
          <button onClick={() => { setBCount(100); setTrained(null); }} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {trained && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <AccCard label="Accuracy · School A" pct={shown.a} />
            <AccCard label="Accuracy · School B" pct={shown.b} warn={shown.b < 80} />
          </div>
          <p className="text-[12.5px] leading-relaxed text-txt2">{reaction}</p>
        </div>
      )}
    </div>
  );
}

function DataBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-txt3">
        <span>{label}</span><span className="tabular-nums">{count}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-panel">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(count / max) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function AccCard({ label, pct, warn }: { label: string; pct: number; warn?: boolean }) {
  const color = warn ? "var(--warn)" : "var(--ok)";
  return (
    <div className="rounded-[10px] border border-border bg-panel p-3">
      <div className="text-[11px] text-txt3">{label}</div>
      <div className="mt-0.5 text-[20px] font-bold tabular-nums" style={{ color }}>{pct}%</div>
    </div>
  );
}
