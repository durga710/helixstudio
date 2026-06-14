"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "./index";
import { getDataset, featureLabel, CLASS_COLORS } from "@/components/lab/datasets";

/* DataExplorer — "Make the first cut." The student picks which two measurements
 * to plot (features), then drags a divider to split the two kinds apart and
 * watches the accuracy. The lesson: the right features + one good cut already
 * separate the data — the seed of every classifier. */

const W = 330;
const H = 250;
const PAD = 34;
const GOAL = 0.9;

export function DataExplorer({ config, onComplete, onState }: WidgetProps) {
  const ds = useMemo(() => getDataset(typeof config?.dataset === "string" ? config.dataset : "penguins"), [config]);
  const a = ds.classes[0];
  const b = ds.classes[1] ?? ds.classes[0];
  const [x, setX] = useState(ds.featureNames[0]);
  const [y, setY] = useState(ds.featureNames[1] ?? ds.featureNames[0]);
  const [axis, setAxis] = useState<"x" | "y">("x");
  const done = useRef(false);

  const range = (f: string) => {
    const vals = ds.points.map((p) => p.features[f]);
    return [Math.min(...vals), Math.max(...vals)] as const;
  };
  const [xMin, xMax] = range(x);
  const [yMin, yMax] = range(y);
  const cutFeat = axis === "x" ? x : y;
  const [cMin, cMax] = range(cutFeat);
  const [cut, setCut] = useState((cMin + cMax) / 2);

  const sx = (v: number) => PAD + ((v - xMin) / (xMax - xMin || 1)) * (W - PAD * 2);
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD * 2);

  // The two sides each predict their majority kind; accuracy = fraction right.
  const { acc, lowClass, highClass } = useMemo(() => {
    const low = ds.points.filter((p) => p.features[cutFeat] <= cut);
    const high = ds.points.filter((p) => p.features[cutFeat] > cut);
    const maj = (g: typeof ds.points) => (g.filter((p) => p.label === a).length >= g.length / 2 ? a : b);
    const lc = maj(low);
    const hc = maj(high);
    let ok = 0;
    for (const p of ds.points) if ((p.features[cutFeat] > cut ? hc : lc) === p.label) ok++;
    return { acc: ok / ds.points.length, lowClass: lc, highClass: hc };
  }, [ds, cutFeat, cut, a, b]);

  const accPct = Math.round(acc * 100);
  useEffect(() => {
    onState?.({ x, y, cutFeature: cutFeat, accuracy: accPct });
    if (acc >= GOAL && !done.current) {
      done.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, cutFeat, accPct]);

  function pickAxis(which: "x" | "y", f: string) {
    if (which === "x") setX(f);
    else setY(f);
    const cf = which === axis ? f : cutFeat;
    const [lo, hi] = range(cf);
    if (which === axis) setCut((lo + hi) / 2);
  }
  function pickCutAxis(which: "x" | "y") {
    setAxis(which);
    const [lo, hi] = range(which === "x" ? x : y);
    setCut((lo + hi) / 2);
  }

  const colorOf = (label: string) => CLASS_COLORS[ds.classes.indexOf(label) % CLASS_COLORS.length];

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-2 flex items-center gap-x-4 text-[12px]">
        <span className="text-txt3">
          Separated: <b className="text-txt" style={{ color: acc >= GOAL ? "var(--ok)" : undefined }}>{accPct}%</b>
          <span className="text-txt3"> · goal {Math.round(GOAL * 100)}%</span>
        </span>
        {acc >= GOAL && <span className="ml-auto text-[11.5px] font-semibold text-ok">clean cut! ✓</span>}
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-center gap-3 text-[12px]">
        <label className="flex items-center gap-1.5 text-txt3">
          X
          <select value={x} onChange={(e) => pickAxis("x", e.target.value)} className="rounded-md border border-border2 bg-panel px-2 py-1 text-txt2 outline-none focus:border-accent">
            {ds.featureNames.map((f) => (
              <option key={f} value={f}>{featureLabel(f)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-txt3">
          Y
          <select value={y} onChange={(e) => pickAxis("y", e.target.value)} className="rounded-md border border-border2 bg-panel px-2 py-1 text-txt2 outline-none focus:border-accent">
            {ds.featureNames.map((f) => (
              <option key={f} value={f}>{featureLabel(f)}</option>
            ))}
          </select>
        </label>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-border2 bg-panel">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <text x={W / 2} y={H - 6} textAnchor="middle" fill="#7d8ba3" fontSize={10}>{featureLabel(x)}</text>
        <text x={10} y={H / 2} textAnchor="middle" fill="#7d8ba3" fontSize={10} transform={`rotate(-90 10 ${H / 2})`}>{featureLabel(y)}</text>

        {/* the divider */}
        {axis === "x" ? (
          <line x1={sx(cut)} y1={PAD} x2={sx(cut)} y2={H - PAD} stroke="#ffb000" strokeWidth={2} strokeDasharray="4 3" />
        ) : (
          <line x1={PAD} y1={sy(cut)} x2={W - PAD} y2={sy(cut)} stroke="#ffb000" strokeWidth={2} strokeDasharray="4 3" />
        )}

        {ds.points.map((p, i) => (
          <circle key={i} cx={sx(p.features[x])} cy={sy(p.features[y])} r={4.5} fill={colorOf(p.label)} fillOpacity={0.9} />
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="text-txt3">Cut along:</span>
        <div className="inline-flex overflow-hidden rounded-md border border-border2">
          {(["x", "y"] as const).map((w) => (
            <button
              key={w}
              onClick={() => pickCutAxis(w)}
              className={`px-2.5 py-1 transition-colors ${axis === w ? "bg-accent text-accent-ink" : "bg-panel text-txt3 hover:text-txt"}`}
            >
              {featureLabel(w === "x" ? x : y)}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={cMin}
          max={cMax}
          step={(cMax - cMin) / 100}
          value={cut}
          onChange={(e) => setCut(Number(e.target.value))}
          className="min-w-[120px] flex-1 accent-[var(--accent)]"
          aria-label="Divider position"
        />
      </div>
      <div className="mt-1.5 text-center text-[11px] text-txt3">
        one side → <b style={{ color: colorOf(lowClass) }}>{lowClass}</b>, other side → <b style={{ color: colorOf(highClass) }}>{highClass}</b>. Pick the two measurements that split them best, then slide the cut.
      </div>
    </div>
  );
}
