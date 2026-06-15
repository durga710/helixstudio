"use client";

import { motion } from "motion/react";

interface ProgressIndicatorProps {
  /** 0–100. */
  value: number;
  /** Short status label shown left of the percentage. */
  label?: string;
  /** Disable the easing transition (reduced motion). */
  instant?: boolean;
  className?: string;
}

/**
 * Slim determinate progress bar that eases toward `value`. A faint sheen sweeps
 * while in flight (< 100) to signal live work without being noisy.
 */
export function ProgressIndicator({ value, label, instant = false, className }: ProgressIndicatorProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const done = clamped >= 100;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-medium text-txt3">
        <span>{label ?? (done ? "Complete" : "Working…")}</span>
        <span className="tabular-nums" aria-hidden>
          {Math.round(clamped)}%
        </span>
      </div>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-border/70"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Demo progress"}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: done
              ? "var(--green)"
              : "linear-gradient(90deg, color-mix(in srgb, var(--accent) 70%, transparent), var(--accent))",
          }}
          initial={false}
          animate={{ width: `${clamped}%` }}
          transition={instant ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 24 }}
        />
        {!done && !instant && (
          <motion.div
            aria-hidden
            className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/25 to-transparent"
            animate={{ x: ["-4rem", "100%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
    </div>
  );
}
