"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
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
import { AGENTS, type AgentId } from "@/components/demo/ScenarioRegistry";
import { Reveal } from "./Reveal";

const META: Record<AgentId, { icon: LucideIcon; sample: string }> = {
  planner: { icon: ListChecks, sample: "Split into 6 steps · 1 migration" },
  analyzer: { icon: ScanSearch, sample: "Indexed 1,284 files · mapped data flow" },
  architect: { icon: DraftingCompass, sample: "Chose server components + RSC cache" },
  engineer: { icon: Wrench, sample: "Wrote 6 files · 312 LOC" },
  reviewer: { icon: Search, sample: "Flagged 2 edge cases · both fixed" },
  security: { icon: ShieldCheck, sample: "0 vulnerabilities · authz verified" },
  performance: { icon: Gauge, sample: "Bundle 142 kB → 98 kB" },
};

export function AgentsSection() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<AgentId | null>(null);

  return (
    <section id="agents" className="border-y border-border bg-bg2 py-[84px]">
      <div className="mx-auto max-w-[1120px] px-6">
        <Reveal className="mx-auto mb-12 max-w-[660px] text-center">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">A team, not a tool</span>
          <h2 className="mt-2.5 text-[clamp(26px,4vw,40px)] font-bold tracking-tight text-txt">
            Seven specialists on every change.
          </h2>
          <p className="mt-3 text-base text-txt2">
            Each agent owns one job and confirms its work before the next begins — the way a senior team ships.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent, i) => {
            const { icon: Icon, sample } = META[agent.id];
            const isActive = active === agent.id;
            return (
              <Reveal as="div" key={agent.id} delay={reduced ? 0 : i * 0.05}>
                <motion.button
                  type="button"
                  onMouseEnter={() => setActive(agent.id)}
                  onMouseLeave={() => setActive((a) => (a === agent.id ? null : a))}
                  onFocus={() => setActive(agent.id)}
                  onBlur={() => setActive((a) => (a === agent.id ? null : a))}
                  whileHover={reduced ? undefined : { y: -4 }}
                  className="group relative flex w-full flex-col gap-3 rounded-2xl border border-border bg-panel p-5 text-left transition-colors hover:border-accent focus-visible:border-accent"
                  aria-pressed={isActive}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border2 bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent transition-colors"
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold text-txt">{agent.name}</span>
                      <span className="block text-[12.5px] text-txt3">{agent.role}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-txt3">
                      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-ok" : "bg-border2"}`} />
                      {isActive ? "active" : "ready"}
                    </span>
                  </span>

                  {/* sample output — expands on hover/focus */}
                  <motion.span
                    initial={false}
                    animate={{ height: isActive || reduced ? "auto" : 0, opacity: isActive || reduced ? 1 : 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="block overflow-hidden"
                  >
                    <span className="mt-0.5 block rounded-lg border border-border bg-[var(--code-bg)] px-3 py-2 font-mono text-[11.5px] text-txt2">
                      <span className="text-ok">✓</span> {sample}
                    </span>
                  </motion.span>
                </motion.button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
