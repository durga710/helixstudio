/**
 * Server-safe catalog of the Lab's interactive widgets — ids + descriptions.
 * The client widget registry (`src/components/lab/widgets/index.tsx`) registers
 * components for these ids; AI generation, the lesson editor's widget picker,
 * and lesson validation all reference THIS list (never client code), so an
 * authored lesson can only embed a widget that actually exists.
 *
 * Add a widget's id here when its component is registered.
 */

export interface WidgetInfo {
  id: string;
  label: string;
  /** Shown to the model so it knows when to use the widget. */
  desc: string;
}

export const WIDGET_CATALOG: WidgetInfo[] = [
  {
    id: "classifier",
    label: "Image classifier (train your own)",
    desc: "The student trains a real image classifier with webcam/upload examples, then tests it live. Use for: classification, what 'training' means, teaching a computer to recognize things.",
  },
  {
    id: "dataExplorer",
    label: "Data explorer (scatter plot)",
    desc: "The student plots a toy dataset, choosing which two measurements go on the X/Y axes, and sees the kinds form clusters. Use for: what data/features/labels are, spotting patterns, why data matters.",
  },
  {
    id: "regression",
    label: "Regression playground (line of best fit)",
    desc: "The student drags dots and fits a straight line that predicts a number, watching the error shrink. Use for: regression, predicting a number (not a category), line of best fit, error/loss.",
  },
  {
    id: "tree",
    label: "Decision-tree splitter",
    desc: "The student picks a measurement and a threshold to split a dataset and sees the yes/no rule + accuracy. Use for: decision trees, splitting data with questions, why trees are explainable.",
  },
  {
    id: "neuron",
    label: "Neuron (perceptron) playground",
    desc: "The student tilts a line with weight sliders to separate two groups, or presses 'Let it learn' to watch the neuron tune its own weights. Use for: neurons, weights, decision boundary, how a network learns.",
  },
];

export const WIDGET_IDS: string[] = WIDGET_CATALOG.map((w) => w.id);

export function isWidgetId(id: string): boolean {
  return WIDGET_IDS.includes(id);
}
