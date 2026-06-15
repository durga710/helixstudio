"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import {
  AGENT_BY_ID,
  DEFAULT_HOLD,
  SCENARIOS,
  initialAgentStates,
  type AgentId,
  type AgentState,
} from "./ScenarioRegistry";
import { AgentPipeline } from "./AgentPipeline";
import { InteractiveTerminal, type RevealedLine } from "./InteractiveTerminal";

type Phase = "typing" | "running";

const TICK = 90; // ms — heartbeat for pausable step holds

/**
 * DemoEngine — the autoplaying, looping hero simulation.
 *
 * A single `cursor` walks the active scenario's steps. The visible terminal
 * lines, agent states, and progress are all *derived* from that cursor, so the
 * three surfaces can never desync. The loop pauses while hovered, off-screen,
 * or when the tab is hidden, and collapses to a static finished frame under
 * `prefers-reduced-motion`.
 */
export function DemoEngine({ className }: { className?: string }) {
  const reduced = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { amount: 0.35 });

  const [scenarioIndex, setScenarioIndex] = useState(0);
  const scenario = SCENARIOS[scenarioIndex];
  const lastStep = scenario.steps.length - 1;

  // Reduced motion → show the finished frame, no timers, no loop.
  const [phase, setPhase] = useState<Phase>(reduced ? "running" : "typing");
  const [cursor, setCursor] = useState(reduced ? lastStep : -1);

  // Pause sources.
  const [hovered, setHovered] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const paused = hovered || !inView || tabHidden;
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Guards re-entrant onComplete from the streaming line.
  const handledStreamCursor = useRef(-1);

  const reset = useCallback(() => {
    handledStreamCursor.current = -1;
    setScenarioIndex((i) => (i + 1) % SCENARIOS.length);
    setPhase("typing");
    setCursor(-1);
  }, []);

  const advance = useCallback(() => {
    setCursor((c) => (c >= lastStep ? c : c + 1));
  }, [lastStep]);

  // Pausable dwell for non-streamed steps.
  useEffect(() => {
    if (reduced || phase !== "running") return;
    const step = scenario.steps[cursor];
    if (!step || step.stream) return; // streamed steps advance via onStreamComplete
    const hold = step.hold ?? DEFAULT_HOLD;
    let elapsed = 0;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      elapsed += TICK;
      if (elapsed >= hold) {
        window.clearInterval(id);
        if (cursor >= lastStep) reset();
        else advance();
      }
    }, TICK);
    return () => window.clearInterval(id);
  }, [reduced, phase, cursor, scenario, lastStep, advance, reset]);

  const onCommandTyped = useCallback(() => {
    setPhase("running");
    setCursor((c) => (c < 0 ? 0 : c));
  }, []);

  const onStreamComplete = useCallback(() => {
    const step = scenario.steps[cursor];
    if (!step?.stream) return;
    if (handledStreamCursor.current === cursor) return;
    handledStreamCursor.current = cursor;
    if (cursor >= lastStep) reset();
    else advance();
  }, [scenario, cursor, lastStep, advance, reset]);

  // ---- Derived view state (pure functions of cursor) ----
  const revealedLines = useMemo<RevealedLine[]>(() => {
    const out: RevealedLine[] = [];
    for (let i = 0; i <= cursor; i++) {
      const step = scenario.steps[i];
      if (step?.line) out.push({ ...step.line, id: i, streaming: !reduced && i === cursor && Boolean(step.stream) });
    }
    return out;
  }, [scenario, cursor, reduced]);

  const agentStates = useMemo<Record<AgentId, AgentState>>(() => {
    const m = initialAgentStates();
    for (let i = 0; i <= cursor; i++) {
      const a = scenario.steps[i]?.agent;
      if (a) m[a.id] = a.state;
    }
    return m;
  }, [scenario, cursor]);

  const progress = useMemo(() => {
    let p = 0;
    for (let i = 0; i <= cursor; i++) {
      const v = scenario.steps[i]?.progress;
      if (typeof v === "number") p = v;
    }
    return p;
  }, [scenario, cursor]);

  const progressLabel = useMemo(() => {
    if (progress >= 100) return "Complete";
    if (phase === "typing") return "Ready";
    const working = (Object.keys(agentStates) as AgentId[]).find((id) => agentStates[id] === "working");
    return working ? AGENT_BY_ID[working].name : "Working…";
  }, [progress, phase, agentStates]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-roledescription="animated product demo"
      aria-label={`Helix Studio running ${scenario.command} — seven AI agents plan, build, review, secure, and optimize the change automatically.`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
    >
      <div className="grid h-[440px] grid-cols-1 gap-2.5 lg:grid-cols-[1fr_212px]">
        <InteractiveTerminal
          file={scenario.file}
          command={scenario.command}
          commandInstant={reduced}
          typingCommand={!reduced && phase === "typing"}
          onCommandTyped={onCommandTyped}
          lines={revealedLines}
          onStreamComplete={onStreamComplete}
          progress={progress}
          progressLabel={progressLabel}
          paused={paused}
          instant={reduced}
        />
        <div className="hidden rounded-xl border border-border bg-panel/50 p-2 lg:block">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-txt3">
            Agents
          </div>
          <AgentPipeline states={agentStates} instant={reduced} className="space-y-0.5" />
        </div>
      </div>
    </div>
  );
}
