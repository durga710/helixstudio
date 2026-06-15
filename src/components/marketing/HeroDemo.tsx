"use client";

import { motion, useReducedMotion } from "motion/react";
import { Bot } from "lucide-react";
import { DemoEngine } from "@/components/demo/DemoEngine";

/**
 * The hero's right-hand showpiece: the live `DemoEngine` set in a premium
 * floating frame with an accent glow and a small "7 agents" badge. Entrance is
 * a single soft rise; everything inside runs itself.
 */
export function HeroDemo({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      initial={reduced ? false : { opacity: 0, y: 24, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* accent glow */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[28px] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(440px 240px at 70% 20%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 70%)",
        }}
      />

      <div className="rounded-2xl border border-border2 bg-panel/70 p-2.5 shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <DemoEngine />
      </div>

      {/* floating badge */}
      <motion.div
        className="absolute -bottom-4 -left-3 hidden items-center gap-2 rounded-xl border border-border2 bg-panel px-3 py-2 shadow-pop sm:flex"
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7 }}
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-accent">
          <Bot className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <span className="leading-tight">
          <span className="block text-[12px] font-semibold text-txt">7 specialist agents</span>
          <span className="block text-[10.5px] text-txt3">plan · build · review · ship</span>
        </span>
      </motion.div>
    </motion.div>
  );
}
