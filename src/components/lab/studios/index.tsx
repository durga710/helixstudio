"use client";

import { useEffect } from "react";
import type { ComponentType } from "react";
import dynamic from "next/dynamic";

/** A studio reports progress toward its goal and a "built it" signal. */
export interface StudioProps {
  /** 0–100 toward the goal — drives the workbench's goal meter. */
  onProgress?: (pct: number) => void;
  /** Goal reached — marks the studio built. */
  onComplete: () => void;
  /** Live state for the AI mentor (what the student has built so far). */
  onState?: (s: Record<string, unknown>) => void;
}

const TreeStudio = dynamic(() => import("./tree-studio").then((m) => m.TreeStudio), {
  ssr: false,
  loading: function TreeStudioLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-12 text-[12px] text-txt3">
        loading the studio…
      </div>
    );
  },
});

/** id → workbench component. Keep in sync with STUDIO_CATALOG (studios.ts). */
export const STUDIOS: Record<string, ComponentType<StudioProps>> = {
  tree: TreeStudio,
};

/** Renders a studio by id, or a friendly placeholder if it's not wired yet. */
export function StudioHost({ studio, onProgress, onComplete, onState }: { studio: string } & StudioProps) {
  const Comp = STUDIOS[studio];

  useEffect(() => {
    if (!Comp) onComplete();
  }, [Comp, onComplete]);

  if (!Comp) {
    return (
      <div className="grid place-items-center rounded-card border border-dashed border-border2 bg-panel2 p-12 text-center">
        <div className="text-3xl">🛠️</div>
        <div className="mt-2 text-[13px] font-medium text-txt2">This studio is coming online</div>
      </div>
    );
  }
  return <Comp onProgress={onProgress} onComplete={onComplete} onState={onState} />;
}
