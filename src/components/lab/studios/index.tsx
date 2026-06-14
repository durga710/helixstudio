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
  /** Live state for the AI mentor + the "what's happening" panel. Include a
   * plain-language `narration` string describing the current state. */
  onState?: (s: Record<string, unknown>) => void;
}

function studioLoading() {
  return (
    <div className="grid place-items-center rounded-card border border-border bg-panel2 p-12 text-[12px] text-txt3">
      loading the studio…
    </div>
  );
}

const TreeStudio = dynamic(() => import("./tree-studio").then((m) => m.TreeStudio), { ssr: false, loading: studioLoading });
const RegressionStudio = dynamic(() => import("./regression-studio").then((m) => m.RegressionStudio), { ssr: false, loading: studioLoading });
const ClusterStudio = dynamic(() => import("./cluster-studio").then((m) => m.ClusterStudio), { ssr: false, loading: studioLoading });
const NetworkStudio = dynamic(() => import("./network-studio").then((m) => m.NetworkStudio), { ssr: false, loading: studioLoading });

/** id → workbench component. Keep in sync with STUDIO_CATALOG (studios.ts). */
export const STUDIOS: Record<string, ComponentType<StudioProps>> = {
  tree: TreeStudio,
  regression: RegressionStudio,
  cluster: ClusterStudio,
  network: NetworkStudio,
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
