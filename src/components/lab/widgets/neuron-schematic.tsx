"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Shuffle } from "lucide-react";
import type { WidgetProps } from "./index";
import { getDataset, CLASS_COLORS } from "@/components/lab/datasets";

/*
 * NeuronSchematic — the "inside of a neuron" diagram. Two input clues feed a node;
 * the learner drags WEIGHT dials (how much each clue matters) and a BIAS dial, and
 * watches the weighted sum + the lit-up output (one class or the other) change in
 * real time, with the live arithmetic shown. A dials-and-lights modality, distinct
 * from the scatter/drag widgets. Completes once the learner makes the output FLIP
 * (sees both answers) — proof they understand the dials drive the decision.
 */

interface Sample {
  label: string;
  x: number;
  y: number;
}

export function NeuronSchematic({ config, onComplete, onState }: WidgetProps) {
  const ds = getDataset(typeof config?.dataset === "string" ? config.dataset : "boundary");
  const fx = ds.featureNames[0];
  const fy = ds.featureNames[1];
  const [classA, classB] = ds.classes;
  const colorA = CLASS_COLORS[0];
  const colorB = CLASS_COLORS[1];

  // A few representative pets to test the same dials on different inputs.
  const samples = useMemo<Sample[]>(() => {
    const a = ds.points.find((p) => p.label === classA);
    const b = ds.points.find((p) => p.label === classB);
    const mid = ds.points[Math.floor(ds.points.length / 2)];
    return [a, b, mid]
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ label: p.label, x: p.features[fx], y: p.features[fy] }));
  }, [ds, fx, fy, classA, classB]);

  const [w1, setW1] = useState(0.5);
  const [w2, setW2] = useState(0.5);
  const [bias, setBias] = useState(-2);
  const [si, setSi] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const completed = useRef(false);

  const s = samples[si] ?? { label: classA, x: 3, y: 3 };
  const sum = w1 * s.x + w2 * s.y + bias;
  const out = sum > 0 ? classB : classA;
  const outColor = sum > 0 ? colorB : colorA;

  useEffect(() => {
    seen.current.add(out);
    onState?.({ w1, w2, bias, sum: Math.round(sum * 10) / 10, output: out, sampleLabel: s.label });
    if (seen.current.size >= 2 && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w1, w2, bias, si]);

  // Sum bar: map [-8, 8] → 0..100%, centered at 50%.
  const pct = Math.max(0, Math.min(100, ((sum + 8) / 16) * 100));

  const sliders: [string, number, (v: number) => void, number, number][] = [
    [`Weight on ${fx}`, w1, setW1, -2, 2],
    [`Weight on ${fy}`, w2, setW2, -2, 2],
    ["Bias (the tipping point)", bias, setBias, -10, 10],
  ];

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      {/* Diagram: inputs → neuron → output */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex flex-col gap-2">
          <InputChip label={fx} value={s.x} color="#3b82f6" />
          <InputChip label={fy} value={s.y} color="#c084fc" />
        </div>
        <div className="flex flex-1 flex-col items-center">
          <ArrowRight className="h-4 w-4 text-txt3" />
        </div>
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-accent bg-hl text-center">
          <span className="text-[10px] leading-tight text-txt3">add<br />it up</span>
        </div>
        <div className="flex flex-1 flex-col items-center">
          <ArrowRight className="h-4 w-4 text-txt3" />
        </div>
        <div
          className="grid h-16 min-w-[72px] place-items-center rounded-xl border-2 px-3 text-center transition-colors"
          style={{ borderColor: outColor, background: `color-mix(in srgb, ${outColor} 14%, transparent)` }}
        >
          <span className="text-[15px] font-bold" style={{ color: outColor }}>{out}</span>
        </div>
      </div>

      {/* Live arithmetic */}
      <div className="mt-3 rounded-md border border-border bg-panel px-3 py-2 text-center font-mono text-[12px] text-txt2">
        {s.x}×{w1.toFixed(1)} + {s.y}×{w2.toFixed(1)} + ({bias.toFixed(1)}) ={" "}
        <b className="text-txt" style={{ color: outColor }}>{sum.toFixed(1)}</b>{" "}
        <span className="text-txt3">→ {sum > 0 ? "positive" : "negative"} → {out}</span>
      </div>

      {/* Sum bar */}
      <div className="mt-2.5">
        <div className="relative h-3 overflow-hidden rounded-full bg-panel">
          <div className="absolute left-1/2 top-0 h-full w-px bg-border2" />
          <div
            className="absolute top-0 h-full rounded-full transition-[width,left] duration-150"
            style={
              sum >= 0
                ? { left: "50%", width: `${pct - 50}%`, background: colorB }
                : { left: `${pct}%`, width: `${50 - pct}%`, background: colorA }
            }
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] text-txt3">
          <span>← {classA}</span>
          <span>{classB} →</span>
        </div>
      </div>

      {/* Dials */}
      <div className="mt-3 space-y-1.5">
        {sliders.map(([label, val, set, lo, hi]) => (
          <label key={label} className="flex items-center gap-2 text-[11.5px] text-txt3">
            <span className="w-32 shrink-0">{label}</span>
            <input
              type="range"
              min={lo}
              max={hi}
              step={(hi - lo) / 100}
              value={val}
              onChange={(e) => set(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
            />
            <span className="w-9 shrink-0 text-right font-mono text-txt2">{val.toFixed(1)}</span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setSi((i) => (i + 1) % samples.length)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <Shuffle className="h-3.5 w-3.5" /> Try another one
        </button>
        <span className="ml-auto text-[11px] text-txt3">
          Drag a dial — watch the answer flip. The dials are the neuron&apos;s <b className="text-txt2">weights</b>.
        </span>
      </div>
    </div>
  );
}

function InputChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-panel px-2.5 py-1.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>
        {value}
      </span>
      <span className="text-[11px] text-txt3">{label}</span>
    </div>
  );
}
