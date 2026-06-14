"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import type { WidgetProps } from "./index";
import { getDataset, CLASS_COLORS } from "@/components/lab/datasets";

/*
 * SortGame — a tap-to-classify warm-up. The learner sorts a handful of items into
 * two bins USING THE CLUES (two measurements shown as little bars), then sees how
 * many they got right. Doing the sorting by hand first makes the later "the neuron
 * does this automatically" land. Pure clicking — a different modality from the
 * drag/slider/chart widgets so the module never feels repetitive.
 * Completes once every item has been sorted.
 */

export function SortGame({ config, onComplete, onState }: WidgetProps) {
  const ds = getDataset(typeof config?.dataset === "string" ? config.dataset : "boundary");
  const fx = ds.featureNames[0];
  const fy = ds.featureNames[1];
  const [classA, classB] = ds.classes;

  // A small, balanced sample so it's a quick warm-up (not a slog).
  const items = useMemo(() => {
    const a = ds.points.filter((p) => p.label === classA).slice(0, 4);
    const b = ds.points.filter((p) => p.label === classB).slice(0, 4);
    // interleave so it's not all-A then all-B
    const out: { label: string; fxv: number; fyv: number }[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) out.push({ label: a[i].label, fxv: a[i].features[fx], fyv: a[i].features[fy] });
      if (b[i]) out.push({ label: b[i].label, fxv: b[i].features[fx], fyv: b[i].features[fy] });
    }
    return out;
  }, [ds, fx, fy, classA, classB]);

  const [picks, setPicks] = useState<Record<number, string>>({});
  const completed = useRef(false);

  const answered = Object.keys(picks).length;
  const allDone = answered === items.length;
  const correct = items.filter((it, i) => picks[i] === it.label).length;

  useEffect(() => {
    onState?.({ answered, correct, total: items.length, done: allDone });
    if (allDone && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, correct, allDone]);

  const max = 10;
  const bar = (v: number, color: string) => (
    <span className="inline-block h-1.5 rounded-full" style={{ width: `${Math.min(100, (v / max) * 100)}%`, background: color }} />
  );

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <p className="mb-3 text-[12.5px] leading-relaxed text-txt2">
        You&apos;re the AI now. Use the two clues to sort each one. Hint:{" "}
        <b className="text-txt">{classA}</b> tend to have smaller {fx} &amp; {fy}; <b className="text-txt">{classB}</b> bigger.
      </p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it, i) => {
          const picked = picks[i];
          const isCorrect = picked === it.label;
          return (
            <li key={i} className="rounded-[10px] border border-border bg-panel p-3">
              <div className="mb-2 space-y-1.5">
                <div className="flex items-center gap-2 text-[10.5px] text-txt3">
                  <span className="w-7 shrink-0">{fx}</span>
                  <span className="flex-1">{bar(it.fxv, "#3b82f6")}</span>
                </div>
                <div className="flex items-center gap-2 text-[10.5px] text-txt3">
                  <span className="w-7 shrink-0">{fy}</span>
                  <span className="flex-1">{bar(it.fyv, "#c084fc")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {ds.classes.map((c, ci) => {
                  const active = picked === c;
                  return (
                    <button
                      key={c}
                      onClick={() => setPicks((p) => (p[i] ? p : { ...p, [i]: c }))}
                      disabled={Boolean(picked)}
                      className="flex-1 rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-default"
                      style={
                        active
                          ? { borderColor: CLASS_COLORS[ci % CLASS_COLORS.length], color: "var(--txt)", background: "color-mix(in srgb, var(--panel2) 100%, transparent)" }
                          : { borderColor: "var(--border2)", color: "var(--txt2)" }
                      }
                    >
                      {c}
                    </button>
                  );
                })}
                {picked && (
                  isCorrect ? (
                    <Check className="h-4 w-4 shrink-0 text-ok" />
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] text-bad">
                      <X className="h-3.5 w-3.5" /> {it.label}
                    </span>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <div className="mt-3 flex items-center gap-2">
          <span className={`text-[12.5px] font-medium ${correct === items.length ? "text-ok" : "text-txt2"}`}>
            You got {correct} of {items.length} right{correct === items.length ? " — perfect!" : ""}. A neuron does this same job — automatically. →
          </span>
          <button
            onClick={() => setPicks({})}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Redo
          </button>
        </div>
      )}
    </div>
  );
}
