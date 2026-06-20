/**
 * Coach diagrams — maps a module's concept (or the current widget) to a small,
 * self-explanatory INTERACTIVE diagram the AI Coach can pop open inline to make
 * a concept concrete. These reuse the existing Lab widgets as zero-token visual
 * explainers (no AI spend) — "show me a picture" beside any explanation.
 *
 * Returns null when no good picture fits (e.g. prompt engineering) — the coach
 * then just explains in words and hides the "picture" action.
 */

export interface CoachDiagram {
  /** A widget id from the client WIDGETS registry. */
  widget: string;
  config?: Record<string, unknown>;
  /** Short title shown above the diagram. */
  title: string;
  /** One friendly line framing what to look at. */
  caption: string;
}

/** Keyword → diagram. First match wins; matched against concept + widget id. */
const RULES: { match: RegExp; diagram: CoachDiagram }[] = [
  {
    match: /neuron|neural|network|weight|perceptron|brain/i,
    diagram: {
      widget: "neuronSchematic",
      title: "Inside a neuron",
      caption: "Drag the dials — see how a neuron adds up its clues and decides. That's the tiny piece a brain is built from.",
    },
  },
  {
    match: /tree|decision|rule|detective/i,
    diagram: {
      widget: "tree",
      config: { dataset: "creatures" },
      title: "A tree of yes/no questions",
      caption: "Add a split and watch a question cut the pile in two. Stack a few and you've built an AI you can read.",
    },
  },
  {
    match: /regress|predict|forecast|number|line|trend/i,
    diagram: {
      widget: "regression",
      title: "The line of best fit",
      caption: "Drag the line through the dots. The closer it hugs them, the better it predicts the next number.",
    },
  },
  {
    match: /train|learn|error|loss|round|epoch|improve|reinforce|maze|reward/i,
    diagram: {
      widget: "errorChart",
      title: "Getting better every round",
      caption: "Press a round and watch the mistakes drop. 'Learning' is just making fewer mistakes each time.",
    },
  },
  {
    match: /data|feature|clean|quality|bias|fair|label|classif|supervis|sort/i,
    diagram: {
      widget: "dataExplorer",
      title: "What the data looks like",
      caption: "Pick what goes on each axis and watch the groups appear. Good data makes the groups easy to tell apart.",
    },
  },
  {
    match: /language|llm|token|word|prompt|temperature|generat/i,
    diagram: {
      widget: "langModel",
      title: "How an AI picks the next word",
      caption: "Train it on a little text, then watch it guess the next word — that's how chatbots write.",
    },
  },
];

/** Pick the best diagram for a concept/widget, or null if none fits well. */
export function pickCoachDiagram(concept?: string, widget?: string): CoachDiagram | null {
  const hay = `${concept ?? ""} ${widget ?? ""}`.trim();
  if (!hay) return null;
  for (const r of RULES) if (r.match.test(hay)) return r.diagram;
  return null;
}
