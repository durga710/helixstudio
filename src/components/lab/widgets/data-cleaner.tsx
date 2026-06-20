"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Trash2, Wrench, RotateCcw, Play } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * DataCleaner — "garbage in, garbage out" made visible. The learner is handed a
 * messy table (missing, impossible, and duplicate values), fixes each bad row
 * (remove or estimate), then trains and compares the dirty vs clean model's
 * accuracy. Deterministic — no AI spend. Teaches: data quality often matters
 * more than the algorithm. Completes after training a fully-cleaned dataset.
 */

type Issue = "missing" | "outlier" | "invalid" | "duplicate" | null;
interface Row { id: number; raw: string; value: number | null; issue: Issue; note: string }

const SOURCE: Row[] = [
  { id: 1, raw: "23", value: 23, issue: null, note: "" },
  { id: 2, raw: "—", value: null, issue: "missing", note: "no value at all" },
  { id: 3, raw: "500", value: 500, issue: "outlier", note: "nobody is 500 years old" },
  { id: 4, raw: "19", value: 19, issue: null, note: "" },
  { id: 5, raw: "???", value: null, issue: "invalid", note: "not a real number" },
  { id: 6, raw: "31", value: 31, issue: null, note: "" },
  { id: 7, raw: "23", value: 23, issue: "duplicate", note: "exact copy of row 1" },
  { id: 8, raw: "27", value: 27, issue: null, note: "" },
];

const ISSUE_LABEL: Record<Exclude<Issue, null>, string> = {
  missing: "Missing",
  outlier: "Impossible",
  invalid: "Invalid",
  duplicate: "Duplicate",
};

type Fix = "removed" | "estimated";

export function DataCleaner({ onComplete, onState }: WidgetProps) {
  const [fixes, setFixes] = useState<Record<number, Fix>>({});
  const [trained, setTrained] = useState(false);
  const completed = useRef(false);

  const badRows = useMemo(() => SOURCE.filter((r) => r.issue), []);
  const median = useMemo(() => {
    const good = SOURCE.filter((r) => !r.issue && r.value !== null).map((r) => r.value as number).sort((a, b) => a - b);
    return good[Math.floor(good.length / 2)] ?? 25;
  }, []);

  const remaining = badRows.filter((r) => !fixes[r.id]).length;
  const allClean = remaining === 0;

  // Deterministic "accuracy": every unresolved bad row drags the model down.
  const DIRTY = Math.round(93 - badRows.length * 11); // if you train on the raw mess
  const current = Math.round(93 - remaining * 11);

  useEffect(() => {
    onState?.({ fixed: badRows.length - remaining, remaining, clean: allClean, accuracy: trained ? current : null });
    if (trained && allClean && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, allClean, trained]);

  function setFix(id: number, f: Fix) {
    setFixes((prev) => ({ ...prev, [id]: f }));
    setTrained(false);
  }
  function reset() {
    setFixes({});
    setTrained(false);
  }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <p className="mb-3 text-[12.5px] leading-relaxed text-txt2">
        This “Age” column is a mess. Fix every <span className="text-warn">flagged</span> row — <b className="text-txt">remove</b> it,
        or <b className="text-txt">estimate</b> a sensible value (≈ {median}) — then train.
      </p>

      <ul className="space-y-1.5">
        {SOURCE.map((r) => {
          const fix = fixes[r.id];
          const bad = Boolean(r.issue);
          return (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-[9px] border bg-panel px-3 py-2 text-[12.5px]"
              style={{ borderColor: bad && !fix ? "color-mix(in srgb, var(--warn) 45%, transparent)" : "var(--border)" }}
            >
              <span className="w-10 shrink-0 tabular-nums text-txt3">#{r.id}</span>
              <span className={`w-12 shrink-0 font-mono ${fix === "removed" ? "text-txt3 line-through" : "text-txt"}`}>
                {fix === "estimated" ? median : r.raw}
              </span>
              {bad && !fix && (
                <span className="inline-flex items-center gap-1 text-[11px] text-warn">
                  <AlertTriangle className="h-3.5 w-3.5" /> {ISSUE_LABEL[r.issue as Exclude<Issue, null>]} · {r.note}
                </span>
              )}
              {!bad && (
                <span className="inline-flex items-center gap-1 text-[11px] text-ok"><Check className="h-3.5 w-3.5" /> looks good</span>
              )}
              {fix && (
                <span className="inline-flex items-center gap-1 text-[11px] text-txt3">
                  {fix === "removed" ? <Trash2 className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />} {fix}
                </span>
              )}
              {bad && (
                <span className="ml-auto flex shrink-0 gap-1.5">
                  <button
                    onClick={() => setFix(r.id, "removed")}
                    className="rounded-md border px-2 py-1 text-[11px] transition-colors"
                    style={fix === "removed" ? { borderColor: "var(--accent)", color: "var(--txt)" } : { borderColor: "var(--border2)", color: "var(--txt2)" }}
                  >
                    Remove
                  </button>
                  {r.issue !== "duplicate" && (
                    <button
                      onClick={() => setFix(r.id, "estimated")}
                      className="rounded-md border px-2 py-1 text-[11px] transition-colors"
                      style={fix === "estimated" ? { borderColor: "var(--accent)", color: "var(--txt)" } : { borderColor: "var(--border2)", color: "var(--txt2)" }}
                    >
                      Estimate
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTrained(true)}
          disabled={!allClean}
          className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40"
          title={allClean ? "" : `${remaining} flagged row${remaining === 1 ? "" : "s"} still to fix`}
        >
          <Play className="h-4 w-4" /> Train model
        </button>
        {remaining > 0 && <span className="text-[12px] text-txt3">{remaining} flagged row{remaining === 1 ? "" : "s"} left</span>}
        {Object.keys(fixes).length > 0 && (
          <button onClick={reset} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt">
            <RotateCcw className="h-3.5 w-3.5" /> Start over
          </button>
        )}
      </div>

      {trained && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ScoreCard label="Dirty data model" pct={DIRTY} tone="bad" sub="trained on the raw mess" />
          <ScoreCard label="Your cleaned model" pct={current} tone="ok" sub="same algorithm, clean data" />
          <p className="sm:col-span-2 text-[12.5px] leading-relaxed text-txt2">
            Same algorithm, <b className="text-txt">{current - DIRTY} points</b> better — just from cleaning the data. Better data often beats a fancier model. →
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, pct, tone, sub }: { label: string; pct: number; tone: "ok" | "bad"; sub: string }) {
  const color = tone === "ok" ? "var(--ok)" : "var(--bad)";
  return (
    <div className="rounded-[10px] border border-border bg-panel p-3">
      <div className="text-[11.5px] text-txt3">{label}</div>
      <div className="mt-0.5 text-[22px] font-bold tabular-nums" style={{ color }}>{pct}%</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1 text-[11px] text-txt3">{sub}</div>
    </div>
  );
}
