"use client";

import { useEffect } from "react";
import type { ComponentType } from "react";
import dynamic from "next/dynamic";

/** Live signals a widget reports up so the tutor (Step 3) has context. */
export interface LabState {
  [k: string]: unknown;
}

export interface WidgetProps {
  config?: Record<string, unknown>;
  /** Call when the student has done enough to move on (gates the Next button). */
  onComplete: () => void;
  /** Optional: report live state (e.g. model accuracy) for the tutor. */
  onState?: (s: LabState) => void;
}

// Lazy so the heavy ML widget only loads on the lab route, when it's reached.
const Classifier = dynamic(() => import("./classifier").then((m) => m.Classifier), {
  ssr: false,
  loading: () => (
    <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
      loading the trainer…
    </div>
  ),
});

/** Reusable interactive ML widgets. Lessons (content) compose these by id — the
 * widget vocabulary is the only thing that gates new lessons. */
export const WIDGETS: Record<string, ComponentType<WidgetProps>> = {
  classifier: Classifier,
};

/** Renders the widget for a `widget` step, or a friendly placeholder if the
 * widget isn't wired yet (so a lesson is always traversable). */
export function WidgetHost({
  widget,
  config,
  onComplete,
  onState,
}: { widget: string } & WidgetProps) {
  const Comp = WIDGETS[widget];

  // No widget yet → don't block the lesson.
  useEffect(() => {
    if (!Comp) onComplete();
  }, [Comp, onComplete]);

  if (!Comp) {
    return (
      <div className="grid place-items-center rounded-card border border-dashed border-border2 bg-panel2 p-10 text-center">
        <div className="text-3xl">🧪</div>
        <div className="mt-2 text-[13px] font-medium text-txt2">Interactive trainer loads here</div>
        <div className="mt-1 text-[11.5px] text-txt3">hands-on widget — coming online</div>
      </div>
    );
  }
  return <Comp config={config} onComplete={onComplete} onState={onState} />;
}
