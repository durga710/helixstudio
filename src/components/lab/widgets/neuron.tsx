"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import type { WidgetProps } from "./index";
import { getDataset, CLASS_COLORS } from "@/components/lab/datasets";

/* NeuronViz — a single neuron (perceptron). Its three "weights" tilt a line
 * that splits the two groups. The student nudges the sliders to separate them,
 * or presses "Let it learn" to watch the neuron tune its own weights. */

const W = 320;
const H = 240;
const PAD = 30;
const DMAX = 10;
const INIT: Weights = { w1: 1, w2: -1, bias: 0 };

interface Weights {
  w1: number;
  w2: number;
  bias: number;
}

export function NeuronViz({ config, onComplete, onState }: WidgetProps) {
  const ds = getDataset(typeof config?.dataset === "string" ? config.dataset : "blobs");
  const fx = ds.featureNames[0];
  const fy = ds.featureNames[1];

  const [weights, setWeights] = useState<Weights>(INIT);
  const [learning, setLearning] = useState(false);
  const done = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const learnRef = useRef<Weights>(INIT);

  const touch = () => {
    if (!done.current) {
      done.current = true;
      onComplete();
    }
  };

  const sx = (x: number) => PAD + (x / DMAX) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / DMAX) * (H - PAD * 2);

  const accuracyOf = (wt: Weights) => {
    let ok = 0;
    for (const p of ds.points) {
      const pred = wt.w1 * p.features[fx] + wt.w2 * p.features[fy] + wt.bias > 0 ? 1 : 0;
      if (pred === ds.classes.indexOf(p.label)) ok++;
    }
    return ok / ds.points.length;
  };
  const onePass = (wt: Weights): Weights => {
    const cur = { ...wt };
    const lr = 0.05;
    for (const p of ds.points) {
      const x = p.features[fx];
      const y = p.features[fy];
      const err = ds.classes.indexOf(p.label) - (cur.w1 * x + cur.w2 * y + cur.bias > 0 ? 1 : 0);
      cur.w1 += lr * err * x;
      cur.w2 += lr * err * y;
      cur.bias += lr * err;
    }
    return cur;
  };

  const acc = Math.round(accuracyOf(weights) * 100);
  onState?.({ weights, accuracy: acc });

  // Boundary: w1*x + w2*y + bias = 0 → y = -(w1*x + bias)/w2
  const lineY = (x: number) => (Math.abs(weights.w2) < 1e-6 ? NaN : -(weights.w1 * x + weights.bias) / weights.w2);
  const clampY = (yv: number, fb: number) => Math.max(PAD, Math.min(H - PAD, Number.isFinite(yv) ? sy(yv) : fb));

  function learn() {
    touch();
    if (learning) return;
    setLearning(true);
    learnRef.current = weights;
    let steps = 0;
    timer.current = setInterval(() => {
      steps++;
      const cur = onePass(learnRef.current);
      learnRef.current = cur;
      setWeights(cur);
      if (accuracyOf(cur) === 1 || steps > 40) {
        if (timer.current) clearInterval(timer.current);
        setLearning(false);
      }
    }, 120);
  }

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setLearning(false);
    setWeights(INIT);
  }

  const sliders: [string, keyof Weights, number, number][] = [
    ["Weight 1", "w1", -3, 3],
    ["Weight 2", "w2", -3, 3],
    ["Bias", "bias", -25, 25],
  ];

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <line x1={sx(0)} y1={clampY(lineY(0), H)} x2={sx(DMAX)} y2={clampY(lineY(DMAX), 0)} stroke="#c084fc" strokeWidth={2} />
        {ds.points.map((p, i) => {
          const ci = ds.classes.indexOf(p.label);
          return <circle key={i} cx={sx(p.features[fx])} cy={sy(p.features[fy])} r={5} fill={CLASS_COLORS[ci % CLASS_COLORS.length]} fillOpacity={0.9} />;
        })}
      </svg>

      <div className="mt-2 space-y-1.5">
        {sliders.map(([label, key, lo, hi]) => (
          <label key={label} className="flex items-center gap-2 text-[11.5px] text-txt3">
            <span className="w-16 shrink-0">{label}</span>
            <input
              type="range"
              min={lo}
              max={hi}
              step={(hi - lo) / 100}
              value={weights[key]}
              onChange={(e) => {
                setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }));
                touch();
              }}
              disabled={learning}
              className="flex-1 accent-[var(--accent)]"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <span className="text-[12px] text-txt3">Separated:</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
          <div className="h-full rounded-full bg-ok transition-[width] duration-150" style={{ width: `${acc}%` }} />
        </div>
        <span className="w-9 text-right text-[12.5px] font-semibold text-txt">{acc}%</span>
        <button
          onClick={learn}
          disabled={learning}
          className="inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" /> {learning ? "Learning…" : "Let it learn"}
        </button>
      </div>
      <p className="mt-2 text-center text-[11.5px] text-txt3">Tilt the line with the sliders — or let the neuron tune itself.</p>
    </div>
  );
}
