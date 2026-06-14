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

// Lazy so heavy widgets only load on the lab route, when reached.
const Classifier = dynamic(() => import("./classifier").then((m) => m.Classifier), {
  ssr: false,
  loading: function ClassifierLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading the trainer…
      </div>
    );
  },
});
const DataExplorer = dynamic(() => import("./data-explorer").then((m) => m.DataExplorer), {
  ssr: false,
  loading: function DataExplorerLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading the data…
      </div>
    );
  },
});
const RegressionPlayground = dynamic(() => import("./regression").then((m) => m.RegressionPlayground), {
  ssr: false,
  loading: function RegressionLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const TreeExplorer = dynamic(() => import("./tree-explorer").then((m) => m.TreeExplorer), {
  ssr: false,
  loading: function TreeLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const NeuronViz = dynamic(() => import("./neuron").then((m) => m.NeuronViz), {
  ssr: false,
  loading: function NeuronLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const NeuronBoundary = dynamic(() => import("./neuron-boundary").then((m) => m.NeuronBoundary), {
  ssr: false,
  loading: function NeuronBoundaryLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const SortGame = dynamic(() => import("./sort-game").then((m) => m.SortGame), {
  ssr: false,
  loading: function SortGameLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const NeuronSchematic = dynamic(() => import("./neuron-schematic").then((m) => m.NeuronSchematic), {
  ssr: false,
  loading: function NeuronSchematicLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const ErrorChart = dynamic(() => import("./error-chart").then((m) => m.ErrorChart), {
  ssr: false,
  loading: function ErrorChartLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const CustomSort = dynamic(() => import("./custom-sort").then((m) => m.CustomSort), {
  ssr: false,
  loading: function CustomSortLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const CustomFlashcards = dynamic(() => import("./custom-flashcards").then((m) => m.CustomFlashcards), {
  ssr: false,
  loading: function CustomFlashcardsLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading…
      </div>
    );
  },
});
const LangModel = dynamic(() => import("./lang-model").then((m) => m.LangModel), {
  ssr: false,
  loading: function LangModelLoading() {
    return (
      <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-[12px] text-txt3">
        loading the language model…
      </div>
    );
  },
});

/** Reusable interactive ML widgets. Lessons (content) compose these by id — the
 * widget vocabulary is the only thing that gates new lessons. Keep in sync with
 * WIDGET_CATALOG in src/lib/lessons/widgets.ts. */
export const WIDGETS: Record<string, ComponentType<WidgetProps>> = {
  classifier: Classifier,
  dataExplorer: DataExplorer,
  regression: RegressionPlayground,
  tree: TreeExplorer,
  neuron: NeuronViz,
  neuronBoundary: NeuronBoundary,
  sortGame: SortGame,
  neuronSchematic: NeuronSchematic,
  errorChart: ErrorChart,
  customSort: CustomSort,
  customFlashcards: CustomFlashcards,
  langModel: LangModel,
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
