"use client";

import { GraduationCap, ArrowRight, X } from "lucide-react";

/* The Learn-mode coach banner: shows the current build-along instruction, a
 * step tracker, and (for "read this, then continue" steps) a Next button. The
 * studio owns the step logic + when to advance; this just renders it the same
 * way across every studio. */
export function StudioCoach({
  index,
  total,
  text,
  cta,
  onNext,
  onExit,
  done,
}: {
  index: number;
  total: number;
  text: string;
  /** When set with onNext, shows a button to advance an informational step. */
  cta?: string;
  onNext?: () => void;
  /** Leave the guided build for free play. */
  onExit?: () => void;
  done?: boolean;
}) {
  return (
    <div className="mb-3 rounded-card border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] p-3.5">
      <div className="mb-1.5 flex items-center gap-2 text-[11.5px] font-semibold text-accent">
        <GraduationCap className="h-3.5 w-3.5" />
        Guided build
        <span className="ml-auto font-normal text-txt3">{done ? "Done" : `Step ${Math.min(index + 1, total)} of ${total}`}</span>
        {onExit && (
          <button onClick={onExit} title="Exit the guided build" className="text-txt3 transition-colors hover:text-txt">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="text-[13px] leading-relaxed text-txt">{text}</p>

      {/* progress dots */}
      {total > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === index && !done ? 16 : 6,
                background: i < index || done ? "var(--ok)" : i === index ? "var(--accent)" : "var(--border2)",
              }}
            />
          ))}
          {cta && onNext && !done && (
            <button
              onClick={onNext}
              className="ml-auto inline-flex items-center gap-1 rounded-md border-none bg-accent px-2.5 py-1 text-[12px] font-semibold text-accent-ink transition hover:brightness-110"
            >
              {cta} <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
