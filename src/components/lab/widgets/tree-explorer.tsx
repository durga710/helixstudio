"use client";

import { useMemo, useRef, useState } from "react";
import type { WidgetProps } from "./index";
import { getDataset, featureLabel, CLASS_COLORS } from "@/components/lab/datasets";

/* TreeExplorer — the student picks one measurement and a threshold to "split"
 * the data, sees the cut on the scatter, the resulting yes/no rule, and how
 * accurate that single split is. The seed of a decision tree. */

const W = 320;
const H = 240;
const PAD = 32;

export function TreeExplorer({ config, onComplete, onState }: WidgetProps) {
  const ds = useMemo(() => getDataset(typeof config?.dataset === "string" ? config.dataset : "fruit2d"), [config]);
  const fx = ds.featureNames[0];
  const fy = ds.featureNames[1] ?? ds.featureNames[0];
  const [splitFeat, setSplitFeat] = useState(fx);
  const range = (f: string) => {
    const v = ds.points.map((p) => p.features[f]);
    return [Math.min(...v), Math.max(...v)] as const;
  };
  const [tMin, tMax] = range(splitFeat);
  const [threshold, setThreshold] = useState((tMin + tMax) / 2);
  const done = useRef(false);

  function touch() {
    if (!done.current) {
      done.current = true;
      onComplete();
    }
  }

  const [xMin, xMax] = range(fx);
  const [yMin, yMax] = range(fy);
  const sx = (v: number) => PAD + ((v - xMin) / (xMax - xMin || 1)) * (W - PAD * 2);
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD * 2);

  // Split into two sides; each side predicts its majority class.
  const high = ds.points.filter((p) => p.features[splitFeat] > threshold);
  const low = ds.points.filter((p) => p.features[splitFeat] <= threshold);
  const majority = (group: typeof ds.points) => {
    const counts = ds.classes.map((c) => group.filter((p) => p.label === c).length);
    const best = counts.indexOf(Math.max(...counts));
    return ds.classes[best] ?? ds.classes[0];
  };
  const highClass = majority(high);
  const lowClass = majority(low);
  let correct = 0;
  for (const p of ds.points) {
    const pred = p.features[splitFeat] > threshold ? highClass : lowClass;
    if (pred === p.label) correct++;
  }
  const acc = Math.round((correct / ds.points.length) * 100);

  onState?.({ splitFeat, threshold: Math.round(threshold * 10) / 10, accuracy: acc });

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-[12px]">
        <span className="text-txt3">Split on:</span>
        {ds.featureNames.map((f) => (
          <button
            key={f}
            onClick={() => {
              setSplitFeat(f);
              const [a, b] = range(f);
              setThreshold((a + b) / 2);
              touch();
            }}
            className={
              "rounded-md border px-2.5 py-1 transition-colors " +
              (splitFeat === f
                ? "border-accent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-txt"
                : "border-border2 bg-panel text-txt2 hover:border-accent")
            }
          >
            {featureLabel(f)}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <text x={W / 2} y={H - 6} textAnchor="middle" fill="#7d8ba3" fontSize={10}>
          {featureLabel(fx)}
        </text>
        <text x={10} y={H / 2} textAnchor="middle" fill="#7d8ba3" fontSize={10} transform={`rotate(-90 10 ${H / 2})`}>
          {featureLabel(fy)}
        </text>

        {/* split line */}
        {splitFeat === fx ? (
          <line x1={sx(threshold)} y1={PAD} x2={sx(threshold)} y2={H - PAD} stroke="#ffb000" strokeWidth={2} strokeDasharray="4 3" />
        ) : (
          <line x1={PAD} y1={sy(threshold)} x2={W - PAD} y2={sy(threshold)} stroke="#ffb000" strokeWidth={2} strokeDasharray="4 3" />
        )}

        {ds.points.map((p, i) => {
          const ci = ds.classes.indexOf(p.label);
          return <circle key={i} cx={sx(p.features[fx])} cy={sy(p.features[fy])} r={4} fill={CLASS_COLORS[ci % CLASS_COLORS.length]} fillOpacity={0.85} />;
        })}
      </svg>

      <input
        type="range"
        min={tMin}
        max={tMax}
        step={(tMax - tMin) / 100}
        value={threshold}
        onChange={(e) => {
          setThreshold(Number(e.target.value));
          touch();
        }}
        className="mt-2 w-full accent-[var(--accent)]"
        aria-label="Split threshold"
      />

      <div className="mt-2 rounded-[9px] border border-border bg-panel px-3 py-2 text-center text-[12px] text-txt2">
        if <b className="text-txt">{featureLabel(splitFeat)}</b> &gt; {threshold.toFixed(1)} → <b style={{ color: CLASS_COLORS[ds.classes.indexOf(highClass)] }}>{highClass}</b>, else →{" "}
        <b style={{ color: CLASS_COLORS[ds.classes.indexOf(lowClass)] }}>{lowClass}</b>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[12px] text-txt3">Accuracy</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
          <div className="h-full rounded-full bg-ok transition-[width] duration-200" style={{ width: `${acc}%` }} />
        </div>
        <span className="text-[12.5px] font-semibold text-txt">{acc}%</span>
      </div>
      <p className="mt-2 text-center text-[11.5px] text-txt3">Slide the cut — find the split that sorts them best.</p>
    </div>
  );
}
