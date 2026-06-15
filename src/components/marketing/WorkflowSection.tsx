"use client";

import { Hammer, ListChecks, Rocket, Search, ShieldCheck, TrendingUp } from "lucide-react";
import { WorkflowTimeline, type TimelineStep } from "@/components/demo/WorkflowTimeline";
import { Reveal } from "./Reveal";

const STEPS: TimelineStep[] = [
  { label: "Plan", sub: "Scope the work", icon: ListChecks },
  { label: "Build", sub: "Generate & edit", icon: Hammer },
  { label: "Review", sub: "Catch defects", icon: Search },
  { label: "Secure", sub: "Audit & harden", icon: ShieldCheck },
  { label: "Deploy", sub: "Ship to prod", icon: Rocket },
  { label: "Scale", sub: "Monitor & grow", icon: TrendingUp },
];

export function WorkflowSection() {
  return (
    <section id="workflow" className="py-[84px]">
      <div className="mx-auto max-w-[1120px] px-6">
        <Reveal className="mx-auto mb-12 max-w-[640px] text-center">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">One continuous workflow</span>
          <h2 className="mt-2.5 text-[clamp(26px,4vw,40px)] font-bold tracking-tight text-txt">
            From idea to production, without the hand-offs.
          </h2>
          <p className="mt-3 text-base text-txt2">
            Every Helix task moves through the same six stages — each one automated, observable, and reversible.
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="rounded-2xl border border-border bg-panel/40 px-6 py-9 sm:px-10">
            <WorkflowTimeline steps={STEPS} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
