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
import { ProgressIndicator } from "@/components/demo/ProgressIndicator";

/* The LIVE seven-agent pipeline for /build — the real counterpart to the
 * welcome page's Watch Demo. State is driven by `phase` events the orchestrator
 * streams (src/lib/orchestrator.ts); this component is pure presentation. */

export type PipelinePhaseId =
  | "planner"
  | "analyzer"
  | "architect"
  | "engineer"
  | "reviewer"
  | "security"
  | "performance";

export type PhaseState = "waiting" | "working" | "complete" | "skipped";

export interface PhaseView {
  state: PhaseState;
  result?: string;
}

const AGENTS: { id: PipelinePhaseId; name: string; role: string; icon: LucideIcon }[] = [
  { id: "planner", name: "Planner", role: "Breaks the request into steps", icon: ListChecks },
  { id: "analyzer", name: "Repository Analyzer", role: "Maps the existing codebase", icon: ScanSearch },
  { id: "architect", name: "Architect", role: "Designs the solution", icon: DraftingCompass },
  { id: "engineer", name: "Engineer", role: "Writes the implementation", icon: Wrench },
  { id: "reviewer", name: "Reviewer", role: "Catches logic errors", icon: Search },
  { id: "security", name: "Security Auditor", role: "Scans for vulnerabilities", icon: ShieldCheck },
  { id: "performance", name: "Performance Auditor", role: "Measures the bundle", icon: Gauge },
];

export const PIPELINE_AGENT_IDS = AGENTS.map((a) => a.id);

function StatusDot({ state }: { state: PhaseState }) {
  if (state === "complete") {
    return <span className="block h-2.5 w-2.5 rounded-full bg-ok shadow-[0_0_8px_var(--green)]" />;
  }
  if (state === "working") {
    return (
      <span className="relative block h-2.5 w-2.5">
        <span className="absolute inset-0 rounded-full bg-accent" />
        <motion.span
          className="absolute inset-0 rounded-full bg-accent"
          animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
        />
      </span>
    );
  }
  if (state === "skipped") return <span className="block h-2.5 w-2.5 rounded-full bg-border2" />;
  return <span className="block h-2.5 w-2.5 rounded-full border border-border2" />;
}

interface Props {
  phases: Record<PipelinePhaseId, PhaseView>;
  progress: number;
  progressLabel: string;
}

/** Vertical roster of the seven agents with live state + result lines, plus the
 * overall progress bar. Mirrors the welcome-page demo's AgentPipeline. */
export function AgentPipelinePanel({ phases, progress, progressLabel }: Props) {
  return (
    <div className="scroll-area flex h-full flex-col overflow-auto p-3">
      <ProgressIndicator value={progress} label={progressLabel} className="mb-3" />
      <ul className="space-y-1" aria-label="Agent pipeline status">
        {AGENTS.map((agent) => {
          const view = phases[agent.id] ?? { state: "waiting" as PhaseState };
          const Icon = agent.icon;
          const active = view.state === "working";
          const done = view.state === "complete";
          return (
            <li
              key={agent.id}
              className="rounded-lg px-2 py-1.5 transition-colors"
              style={{ background: active ? "color-mix(in srgb, var(--accent) 9%, transparent)" : "transparent" }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors"
                  style={{
                    borderColor: done
                      ? "color-mix(in srgb, var(--green) 45%, transparent)"
                      : active
                        ? "var(--accent)"
                        : "var(--border)",
                    background: done
                      ? "color-mix(in srgb, var(--green) 14%, transparent)"
                      : active
                        ? "color-mix(in srgb, var(--accent) 16%, transparent)"
                        : "transparent",
                    color: done ? "var(--green)" : active ? "var(--accent)" : "var(--txt-3)",
                    boxShadow: active
                      ? "0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent), 0 0 16px -2px color-mix(in srgb,var(--accent) 60%,transparent)"
                      : "none",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1" style={{ opacity: view.state === "waiting" ? 0.6 : 1 }}>
                  <span className="block truncate text-[12px] font-medium text-txt">{agent.name}</span>
                  <span className="block truncate text-[10.5px] text-txt3">
                    {done ? "Complete" : active ? "Working…" : view.state === "skipped" ? "Skipped" : agent.role}
                  </span>
                </span>
                <StatusDot state={view.state} />
              </div>
              {done && view.result && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden pl-[38px]"
                >
                  <span className="mt-1 block rounded-md border border-border bg-[var(--code-bg)] px-2.5 py-1.5 font-mono text-[11px] leading-snug text-txt2">
                    <span className="text-ok">✓</span> {view.result}
                  </span>
                </motion.div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
