"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, RotateCcw, Gauge, AlertTriangle } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * TokenGrid — every word an AI generates costs computation (tokens → energy). The
 * learner answers a city's requests, choosing how long each reply should be while
 * staying under a daily token budget. Match the reply length to what the request
 * actually needs: short answers for simple asks, detail only where it helps.
 * Deterministic — no AI spend. Teaches: tokens cost energy; efficient prompting
 * scales. Completes once every request is handled within budget.
 */

interface Req { text: string; complex: boolean }
const REQUESTS: Req[] = [
  { text: "What time does the library open?", complex: false },
  { text: "Explain how the new recycling rules work, with examples.", complex: true },
  { text: "Is it going to rain today?", complex: false },
  { text: "Summarize the city budget and what changed this year.", complex: true },
  { text: "What's the bus number to the museum?", complex: false },
];
const OPTIONS = [
  { key: "short", label: "Short", cost: 40 },
  { key: "medium", label: "Medium", cost: 110 },
  { key: "detailed", label: "Detailed", cost: 280 },
] as const;
type Len = (typeof OPTIONS)[number]["key"];
const BUDGET = 700;

// How helpful is a reply length for this request? (full=20, ok=12, poor=4)
function help(complex: boolean, len: Len): number {
  if (complex) return len === "detailed" ? 20 : len === "medium" ? 13 : 4;
  return len === "short" ? 20 : len === "medium" ? 16 : 14; // detail on a simple ask is just waste
}

export function TokenGrid({ onComplete, onState }: WidgetProps) {
  const [picks, setPicks] = useState<Record<number, Len>>({});
  const completed = useRef(false);

  const used = useMemo(() => Object.values(picks).reduce((a, l) => a + OPTIONS.find((o) => o.key === l)!.cost, 0), [picks]);
  const helpfulness = useMemo(() => Object.entries(picks).reduce((a, [i, l]) => a + help(REQUESTS[+i].complex, l), 0), [picks]);
  const maxHelp = REQUESTS.length * 20;
  const answered = Object.keys(picks).length;
  const allAnswered = answered === REQUESTS.length;
  const over = used > BUDGET;
  const win = allAnswered && !over;

  useEffect(() => {
    onState?.({ tokensUsed: used, budget: BUDGET, over, helpfulness, efficiency: used ? Math.round((helpfulness / used) * 100) : 0, done: win });
    if (win && helpfulness >= maxHelp - 8 && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [used, over, helpfulness, win]);

  const pct = Math.min(100, Math.round((used / BUDGET) * 100));

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <p className="mb-3 text-[12.5px] leading-relaxed text-txt2">
        You run the city&apos;s AI. Answer every request, but stay under the daily <b className="text-txt">token budget</b>. Long replies cost more energy — only spend it where it helps.
      </p>

      {/* Token meter */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11.5px]">
          <span className="inline-flex items-center gap-1.5 text-txt2"><Gauge className="h-3.5 w-3.5" /> Tokens used today</span>
          <span className="tabular-nums" style={{ color: over ? "var(--bad)" : "var(--txt2)" }}>{used} / {BUDGET}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-panel">
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: over ? "var(--bad)" : pct > 80 ? "var(--warn)" : "var(--accent)" }} />
        </div>
        {over && <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-bad"><AlertTriangle className="h-3.5 w-3.5" /> Over budget — the grid browns out. Trim some replies.</p>}
      </div>

      <ul className="space-y-1.5">
        {REQUESTS.map((r, i) => (
          <li key={i} className="rounded-[10px] border border-border bg-panel p-2.5">
            <div className="mb-1.5 flex items-center gap-2 text-[12.5px] text-txt">
              <span className="flex-1">{r.text}</span>
              <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-[10.5px] text-txt3">{r.complex ? "needs detail" : "simple"}</span>
            </div>
            <div className="flex gap-1.5">
              {OPTIONS.map((o) => {
                const on = picks[i] === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => setPicks((p) => ({ ...p, [i]: o.key }))}
                    className="flex-1 rounded-md border px-2 py-1.5 text-[11.5px] transition-colors"
                    style={on ? { borderColor: "var(--accent)", color: "var(--txt)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" } : { borderColor: "var(--border2)", color: "var(--txt2)" }}
                  >
                    {o.label} <span className="text-txt3">· {o.cost}</span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-3 text-[11.5px] text-txt3">
        <span>Helpfulness: <b className="tabular-nums text-txt2">{helpfulness}/{maxHelp}</b></span>
        {Object.keys(picks).length > 0 && (
          <button onClick={() => setPicks({})} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {win && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-txt2" style={{ border: "1px solid color-mix(in srgb, var(--ok) 45%, transparent)" }}>
          <Zap className="h-4 w-4 text-ok" /> The grid is stable and citizens are happy — you matched each reply to what it actually needed. That&apos;s efficient AI. →
        </div>
      )}
    </div>
  );
}
