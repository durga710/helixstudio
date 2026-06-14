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
  {
    id: "neuronBoundary",
    label: "Decision-boundary lab (guided, phased)",
    desc: "A guided neuron lab driven by config.phase: 'explore' (drag a line by hand to split two groups), 'step' (train ONE round per button press, watch the line nudge), 'reveal' (the neuron auto-tunes its line until almost none wrong), 'generalize' (trains on studied points, scores on held-out NEW hollow points — shows learning vs memorizing), 'youdo' (fresh easy data, no hints), 'fail' (config.dataset 'ring' — one line can't split a ring, it plateaus, motivating networks). Pick ONE phase per step; sequence several across a lesson. config.dataset presets: boundary, boundaryEasy, ring. Use for: how a neuron learns, decision boundary, weights, training, generalization, the limit of one neuron.",
  },
  {
    id: "sortGame",
    label: "Sort-it game (tap to classify)",
    desc: "The student sorts a handful of items into two bins themselves using two on-screen clue bars, then sees their score. A click/tap warm-up before any model appears. Use for: what classification is, making sorting personal, 'you be the AI'.",
  },
  {
    id: "neuronSchematic",
    label: "Inside a neuron (weight & bias dials)",
    desc: "The 'inside of a neuron' diagram: two input clues feed a node; the student drags weight + bias dials and watches the weighted sum and the lit-up output flip in real time, with the live arithmetic shown. Use for: what weights and bias are, how a neuron decides, the math behind the line — a dials/diagram alternative to the scatter.",
  },
  {
    id: "errorChart",
    label: "Mistakes-per-round chart",
    desc: "The student presses 'train a round' (or Auto) and watches a bar chart of how many mistakes the model still makes drop toward zero each round. Use for: what error/loss is, 'learning = fewer mistakes each round', training progress — a chart modality.",
  },
  {
    id: "customSort",
    label: "Custom sort game (your own data)",
    desc: "A make-your-own two-bin sort game — you set the two bin names, two clue labels, and the items (with their correct bin). The student sorts each item by its clues. config: {binA,binB,clueA,clueB,items:[{a,b,bin}]}. Use for: any 'put things in two groups' topic, on any subject.",
  },
  {
    id: "customFlashcards",
    label: "Custom flashcards (your own deck)",
    desc: "A make-your-own flip-card deck — you set the cards (front + back). The student taps each card to flip it. config: {cards:[{front,back}]}. Use for: vocabulary, key terms, definitions, quick recall on any subject.",
  },
  {
    id: "langModel",
    label: "Language model (next-word predictor)",
    desc: "The student trains a tiny language model on text, then generates new text — adjusting the context window and 'creativity' (temperature) and watching the next-word probabilities. Use for: language models, LLMs, next-token prediction, tokens, temperature, how ChatGPT works.",
  },
];

export const WIDGET_IDS: string[] = WIDGET_CATALOG.map((w) => w.id);

export function isWidgetId(id: string): boolean {
  return WIDGET_IDS.includes(id);
}
