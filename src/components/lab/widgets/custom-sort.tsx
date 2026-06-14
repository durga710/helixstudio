"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * CustomSort — a fully CONFIG-DRIVEN two-bin sort game. Everything (bin names,
 * clue labels, items + their correct bin) comes from `config`, so a teacher can
 * make their own sorting widget about ANY topic in the widget store — no code.
 * Renders like the built-in sortGame but reads its content from config.
 *   config: { binA, binB, clueA, clueB, items: [{ a:number, b:number, bin:0|1 }] }
 * Completes when every item is sorted (or immediately if there are no items, so
 * it never traps a lesson).
 */

const COLORS = ["#00e0c0", "#c084fc"];

interface Item {
  a: number;
  b: number;
  bin: number;
}

export function CustomSort({ config, onComplete, onState }: WidgetProps) {
  const binA = typeof config?.binA === "string" && config.binA ? config.binA : "Group A";
  const binB = typeof config?.binB === "string" && config.binB ? config.binB : "Group B";
  const clueA = typeof config?.clueA === "string" && config.clueA ? config.clueA : "clue 1";
  const clueB = typeof config?.clueB === "string" && config.clueB ? config.clueB : "clue 2";
  const bins = [binA, binB];
  const items: Item[] = Array.isArray(config?.items)
    ? (config.items as unknown[])
        .map((it) => (it && typeof it === "object" ? (it as Record<string, unknown>) : null))
        .filter((it): it is Record<string, unknown> => Boolean(it))
        .map((it) => ({ a: Number(it.a) || 0, b: Number(it.b) || 0, bin: Number(it.bin) === 1 ? 1 : 0 }))
    : [];

  const [picks, setPicks] = useState<Record<number, number>>({});
  const completed = useRef(false);

  const answered = Object.keys(picks).length;
  const allDone = items.length === 0 || answered === items.length;
  const correct = items.filter((it, i) => picks[i] === it.bin).length;

  useEffect(() => {
    onState?.({ answered, correct, total: items.length, done: allDone });
    if (allDone && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, allDone]);

  if (items.length === 0) {
    return (
      <div className="grid place-items-center rounded-card border border-dashed border-border2 bg-panel2 p-8 text-center text-[12px] text-txt3">
        This sorting widget has no items yet — add some in the widget store.
      </div>
    );
  }

  const max = Math.max(10, ...items.flatMap((it) => [it.a, it.b]));
  const bar = (v: number, color: string) => (
    <span className="inline-block h-1.5 rounded-full" style={{ width: `${Math.min(100, (v / max) * 100)}%`, background: color }} />
  );

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <p className="mb-3 text-[12.5px] leading-relaxed text-txt2">
        Sort each one into <b className="text-txt">{binA}</b> or <b className="text-txt">{binB}</b> using its clues.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it, i) => {
          const picked = picks[i];
          const isCorrect = picked === it.bin;
          return (
            <li key={i} className="rounded-[10px] border border-border bg-panel p-3">
              <div className="mb-2 space-y-1.5">
                <div className="flex items-center gap-2 text-[10.5px] text-txt3">
                  <span className="w-12 shrink-0 truncate">{clueA}</span>
                  <span className="flex-1">{bar(it.a, "#3b82f6")}</span>
                </div>
                <div className="flex items-center gap-2 text-[10.5px] text-txt3">
                  <span className="w-12 shrink-0 truncate">{clueB}</span>
                  <span className="flex-1">{bar(it.b, "#c084fc")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {bins.map((b, bi) => {
                  const active = picked === bi;
                  return (
                    <button
                      key={bi}
                      onClick={() => setPicks((p) => (p[i] !== undefined ? p : { ...p, [i]: bi }))}
                      disabled={picked !== undefined}
                      className="flex-1 rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-default"
                      style={active ? { borderColor: COLORS[bi], color: "var(--txt)" } : { borderColor: "var(--border2)", color: "var(--txt2)" }}
                    >
                      {b}
                    </button>
                  );
                })}
                {picked !== undefined &&
                  (isCorrect ? (
                    <Check className="h-4 w-4 shrink-0 text-ok" />
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] text-bad">
                      <X className="h-3.5 w-3.5" /> {bins[it.bin]}
                    </span>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
      {allDone && (
        <div className="mt-3 flex items-center gap-2">
          <span className={`text-[12.5px] font-medium ${correct === items.length ? "text-ok" : "text-txt2"}`}>
            You got {correct} of {items.length} right{correct === items.length ? " — perfect!" : ""}.
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
