"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

export interface TimelineStep {
  label: string;
  sub?: string;
  icon: LucideIcon;
}

interface WorkflowTimelineProps {
  steps: TimelineStep[];
  /** ms each node stays "active" before the next lights up. */
  cadence?: number;
  className?: string;
}

/**
 * A horizontal, auto-advancing sequence of nodes joined by a progress line.
 * The active node pulses; passed nodes settle to "done". It runs only while in
 * view, loops, and renders fully-complete (no motion) under reduced motion.
 * Shared by the Workflow and Deployments sections.
 */
export function WorkflowTimeline({ steps, cadence = 1100, className }: WorkflowTimelineProps) {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [active, setActive] = useState(reduced ? steps.length : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setInterval(() => {
      setActive((a) => (a >= steps.length ? 0 : a + 1));
    }, cadence);
    return () => window.clearInterval(id);
  }, [reduced, inView, steps.length, cadence]);

  const fillPct = reduced ? 100 : steps.length <= 1 ? 100 : (Math.min(active, steps.length - 1) / (steps.length - 1)) * 100;

  return (
    <ol ref={ref} className={`relative grid gap-4 sm:grid-flow-col sm:auto-cols-fr ${className ?? ""}`}>
      {/* connecting rail (horizontal on sm+) */}
      <span aria-hidden className="absolute left-5 right-5 top-5 hidden h-px bg-border sm:block">
        <motion.span
          className="block h-full bg-accent"
          initial={false}
          animate={{ width: `${fillPct}%` }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }}
        />
      </span>

      {steps.map((step, i) => {
        const done = reduced || i < active;
        const isActive = !reduced && i === active;
        const Icon = step.icon;
        return (
          <li key={step.label} className="relative flex items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
            <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-bg transition-colors duration-300"
              style={{
                borderColor: done ? "color-mix(in srgb, var(--green) 55%, transparent)" : isActive ? "var(--accent)" : "var(--border)",
                background: done
                  ? "color-mix(in srgb, var(--green) 14%, transparent)"
                  : isActive
                    ? "color-mix(in srgb, var(--accent) 16%, transparent)"
                    : "var(--panel)",
                color: done ? "var(--green)" : isActive ? "var(--accent)" : "var(--txt-3)",
              }}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {isActive && (
                <motion.span
                  className="absolute inset-0 rounded-full ring-2 ring-accent"
                  animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
                />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-txt">{step.label}</span>
              {step.sub && <span className="mt-0.5 block text-[11.5px] text-txt3">{step.sub}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
