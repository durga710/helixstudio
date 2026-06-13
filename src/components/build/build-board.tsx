/* eslint-disable react-hooks/set-state-in-effect -- the card flow is a deliberate
   time/telemetry-driven animation: effects advance the cursor from props + timers,
   which is exactly the "synchronize with an external system" case the rule allows. */
"use client";

/**
 * BuildBoard — a live, read-only build tracker rendered INLINE as a tab beside
 * the chat on the /build page, styled like the admin batch-job terminal (dark
 * chrome, traffic-lights, mono, accent pulse). It's a visualization, not an
 * interactive tool: cards flow Up next → In progress → Done on their own, driven
 * by the REAL build telemetry passed in (write count + activity steps) with a
 * gentle timer so it never stalls. On a successful turn every card goes green;
 * on error the active card flashes red and drops out. The board can grow
 * mid-build as new work (verify/fix/test) is detected.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

interface BuildBoardProps {
  /** Card titles (token-free, derived from the scaffold's MVC structure). Can
   * grow mid-build as the board detects new work (verify/fix/test). */
  tasks: string[];
  /** Bumped only when a NEW build starts, so appended cards don't reset flow. */
  sessionId: number;
  /** Titles that were added live from real telemetry (get a "new" badge). */
  detected?: string[];
  /** True while a build turn is running. */
  building: boolean;
  /** Real file-writes seen this turn — the primary progress signal. */
  writes: number;
  /** Real activity events this turn — secondary nudge before the first write. */
  steps: number;
  /** The turn errored — flash the active card red, then drop it. */
  errored?: boolean;
}

type Lane = "next" | "active" | "done" | "closed";

export function BuildBoard({ tasks, sessionId, detected = [], building, writes, steps, errored = false }: BuildBoardProps) {
  const detectedSet = new Set(detected);
  const [cursor, setCursor] = useState(0); // index of the active card
  const [dropped, setDropped] = useState(false); // active card closed (red→gone)

  // A NEW build → reset the flow. Cards appended mid-build (verify/fix/test)
  // keep the cursor where it is, so detected work just extends the plan.
  useEffect(() => {
    setCursor(0);
    setDropped(false);
  }, [sessionId]);

  // Advance from REAL telemetry: each file-write (or, early on, activity step)
  // pushes the cursor forward. Never exceeds the last card while building.
  useEffect(() => {
    if (!building) return;
    const signal = Math.max(writes, Math.floor(steps / 2));
    setCursor((c) => Math.min(tasks.length - 1, Math.max(c, signal)));
  }, [writes, steps, building, tasks.length]);

  // Gentle timer so the board still breathes when telemetry is sparse.
  useEffect(() => {
    if (!building) return;
    const id = setInterval(
      () => setCursor((c) => (c < tasks.length - 1 ? c + 1 : c)),
      1600 + Math.floor(Math.random() * 900),
    );
    return () => clearInterval(id);
  }, [building, tasks.length]);

  // Turn finished: success → everything green; error → drop the active card.
  const wasBuilding = useRef(false);
  useEffect(() => {
    if (wasBuilding.current && !building) {
      if (errored) {
        const id = setTimeout(() => setDropped(true), 1400);
        return () => clearTimeout(id);
      }
      setCursor(tasks.length); // all done
    }
    wasBuilding.current = building;
  }, [building, errored, tasks.length]);

  const laneOf = (i: number): Lane => {
    if (errored && building && i === cursor) return "closed";
    if (i < cursor) return "done";
    if (i === cursor) return building ? "active" : "done";
    return "next";
  };

  const cards = tasks
    .map((t, i) => ({ title: t, lane: laneOf(i), i }))
    .filter((c) => !(c.lane === "closed" && dropped));

  const doneCount = cards.filter((c) => c.lane === "done").length;

  // No build yet → a calm empty state so the tab never looks broken.
  if (tasks.length === 0) {
    return (
      <div className="grid h-full place-items-center bg-[#0a0e16] p-6 text-center">
        <div className="text-txt3">
          <LayoutList className="mx-auto mb-2 h-6 w-6 text-txt3/70" />
          <div className="text-[12.5px]">No build running yet.</div>
          <div className="mt-1 text-[11px] text-txt3/70">Describe an app and the plan appears here as it builds.</div>
        </div>
      </div>
    );
  }

  const LANES: { key: Exclude<Lane, "closed">; label: string }[] = [
    { key: "next", label: "Up next" },
    { key: "active", label: "In progress" },
    { key: "done", label: "Done" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0e16]">
      {/* Terminal-style status strip — same language as the admin batch popup. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-[#0d1220] px-3 py-2">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </span>
        <span className="text-[12px] font-medium text-txt2">Build plan · live</span>
        <span className="ml-auto font-mono text-[11px] text-txt3">
          {doneCount}/{tasks.length}
        </span>
        {building ? (
          <span className="animate-pulse text-[11px] text-accent">running…</span>
        ) : (
          <span className="text-[11px] text-ok">{doneCount === tasks.length ? "done" : "idle"}</span>
        )}
      </header>

      {/* Three lanes, filling the tab. */}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-auto p-2.5">
        {LANES.map((lane) => {
          const laneCards = cards.filter((c) =>
            lane.key === "done"
              ? c.lane === "done"
              : lane.key === "active"
                ? c.lane === "active" || c.lane === "closed"
                : c.lane === "next",
          );
          return (
            <div key={lane.key} className="min-w-0">
              <div className="mb-1.5 flex items-center gap-1 px-0.5 font-mono text-[10px] uppercase tracking-wide text-txt3">
                {lane.label}
                <span className="text-txt3/70">{laneCards.length}</span>
              </div>
              <div className="space-y-1.5">
                {laneCards.map((c) => (
                  <Card key={c.i} title={c.title} lane={c.lane} detected={detectedSet.has(c.title)} />
                ))}
                {laneCards.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/50 px-2 py-2 text-center text-[10px] text-txt3/60">
                    —
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ title, lane, detected = false }: { title: string; lane: Lane; detected?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 text-[11px] leading-tight transition-all duration-300",
        lane === "active" && "animate-pulse border-accent/60 bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-txt",
        lane === "done" && "border-[color-mix(in_srgb,#27c93f_45%,transparent)] bg-[color-mix(in_srgb,#27c93f_11%,transparent)] text-ok",
        lane === "next" && "border-border2 bg-panel2/40 text-txt2",
        lane === "closed" && "border-[color-mix(in_srgb,#ff5f56_55%,transparent)] bg-[color-mix(in_srgb,#ff5f56_12%,transparent)] text-bad",
      )}
    >
      <div className="flex items-start gap-1.5">
        {lane === "done" ? (
          <Check className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.6} />
        ) : lane === "active" ? (
          <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
        ) : lane === "closed" ? (
          <X className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.6} />
        ) : (
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-txt3" />
        )}
        <span className="min-w-0 break-words">{title}</span>
        {detected && lane !== "done" && (
          <span className="ml-auto shrink-0 rounded bg-[color-mix(in_srgb,#ffbd2e_22%,transparent)] px-1 text-[8px] font-semibold uppercase tracking-wide text-[#ffd479]">
            new
          </span>
        )}
      </div>
    </div>
  );
}
