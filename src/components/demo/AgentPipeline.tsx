"use client";

import { motion } from "motion/react";
import {
  DraftingCompass,
  Gauge,
  ListChecks,
  ScanSearch,
  Search,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AGENTS, type AgentId, type AgentState } from "./ScenarioRegistry";

const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  planner: ListChecks,
  analyzer: ScanSearch,
  architect: DraftingCompass,
  engineer: Wrench,
  reviewer: Search,
  security: ShieldCheck,
  performance: Gauge,
};

interface AgentPipelineProps {
  states: Record<AgentId, AgentState>;
  /** Disable per-row motion (reduced motion). */
  instant?: boolean;
  className?: string;
}

/** Status dot: hollow (waiting), pulsing accent (working), solid green (complete). */
function StatusDot({ state, instant }: { state: AgentState; instant?: boolean }) {
  if (state === "complete") {
    return <span className="block h-2.5 w-2.5 rounded-full bg-ok shadow-[0_0_8px_var(--green)]" />;
  }
  if (state === "working") {
    return (
      <span className="relative block h-2.5 w-2.5">
        <span className="absolute inset-0 rounded-full bg-accent" />
        {!instant && (
          <motion.span
            className="absolute inset-0 rounded-full bg-accent"
            animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </span>
    );
  }
  return <span className="block h-2.5 w-2.5 rounded-full border border-border2" />;
}

/**
 * Vertical roster of the seven agents with live state. Each row brightens and
 * its icon tile fills as the agent moves waiting → working → complete. The
 * states are fully controlled by `DemoEngine`, so this component is pure.
 */
export function AgentPipeline({ states, instant = false, className }: AgentPipelineProps) {
  return (
    <ul className={className} aria-label="Agent pipeline status">
      {AGENTS.map((agent, i) => {
        const state = states[agent.id];
        const Icon = AGENT_ICONS[agent.id];
        const active = state === "working";
        const done = state === "complete";
        return (
          <motion.li
            key={agent.id}
            initial={instant ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: state === "waiting" ? 0.55 : 1, x: 0 }}
            transition={{ duration: 0.3, delay: instant ? 0 : i * 0.015 }}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors"
            style={{ background: active ? "color-mix(in srgb, var(--accent) 9%, transparent)" : "transparent" }}
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors"
              style={{
                borderColor: done ? "color-mix(in srgb, var(--green) 45%, transparent)" : active ? "var(--accent)" : "var(--border)",
                background: done
                  ? "color-mix(in srgb, var(--green) 14%, transparent)"
                  : active
                    ? "color-mix(in srgb, var(--accent) 16%, transparent)"
                    : "transparent",
                color: done ? "var(--green)" : active ? "var(--accent)" : "var(--txt-3)",
              }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-txt">{agent.name}</span>
              <span className="block truncate text-[10.5px] text-txt3">
                {done ? "Complete" : active ? "Working…" : "Waiting"}
              </span>
            </span>
            <StatusDot state={state} instant={instant} />
          </motion.li>
        );
      })}
    </ul>
  );
}
