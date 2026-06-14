"use client";

import { useMemo, useRef, useState } from "react";
import type { WidgetProps } from "./index";
import { getDataset, featureLabel, CLASS_COLORS } from "@/components/lab/datasets";

/* DataExplorer — a scatter plot over a toy dataset. The student picks which two
 * measurements go on the X and Y axes and watches the kinds separate into
 * clusters: the "aha, AI finds patterns in data" moment. */

const W = 320;
const H = 240;
const PAD = 34;

export function DataExplorer({ config, onComplete, onState }: WidgetProps) {
  const ds = useMemo(() => getDataset(typeof config?.dataset === "string" ? config.dataset : undefined), [config]);
  const [x, setX] = useState(ds.featureNames[0]);
  const [y, setY] = useState(ds.featureNames[1] ?? ds.featureNames[0]);
  const done = useRef(false);

  function interacted() {
    if (!done.current) {
      done.current = true;
      onComplete();
    }
  }

  const range = (f: string) => {
    const vals = ds.points.map((p) => p.features[f]);
    return [Math.min(...vals), Math.max(...vals)] as const;
  };
  const [xMin, xMax] = range(x);
  const [yMin, yMax] = range(y);
  const sx = (v: number) => PAD + ((v - xMin) / (xMax - xMin || 1)) * (W - PAD * 2);
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD * 2);

  onState?.({ dataset: ds.id, x, y });

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-3 text-center text-[12.5px] text-txt2">{ds.summary}</div>

      <div className="mb-3 flex flex-wrap items-center justify-center gap-3 text-[12px]">
        <label className="flex items-center gap-1.5 text-txt3">
          X axis
          <select
            value={x}
            onChange={(e) => {
              setX(e.target.value);
              interacted();
            }}
            className="rounded-md border border-border2 bg-panel px-2 py-1 text-txt2 outline-none focus:border-accent"
          >
            {ds.featureNames.map((f) => (
              <option key={f} value={f}>
                {featureLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-txt3">
          Y axis
          <select
            value={y}
            onChange={(e) => {
              setY(e.target.value);
              interacted();
            }}
            className="rounded-md border border-border2 bg-panel px-2 py-1 text-txt2 outline-none focus:border-accent"
          >
            {ds.featureNames.map((f) => (
              <option key={f} value={f}>
                {featureLabel(f)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Scatter plot of the dataset">
        {/* axes */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <text x={W / 2} y={H - 6} textAnchor="middle" fill="#7d8ba3" fontSize={10}>
          {featureLabel(x)}
        </text>
        <text x={10} y={H / 2} textAnchor="middle" fill="#7d8ba3" fontSize={10} transform={`rotate(-90 10 ${H / 2})`}>
          {featureLabel(y)}
        </text>
        {/* points */}
        {ds.points.map((p, i) => {
          const ci = ds.classes.indexOf(p.label);
          return (
            <circle
              key={i}
              cx={sx(p.features[x])}
              cy={sy(p.features[y])}
              r={4}
              fill={CLASS_COLORS[ci % CLASS_COLORS.length]}
              fillOpacity={0.85}
            >
              <title>{`${p.label} — ${featureLabel(x)}: ${p.features[x]}, ${featureLabel(y)}: ${p.features[y]}`}</title>
            </circle>
          );
        })}
      </svg>

      {/* legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11.5px] text-txt2">
        {ds.classes.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
            {c}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-[11.5px] text-txt3">Try different axes — see how the kinds group together?</p>
    </div>
  );
}
