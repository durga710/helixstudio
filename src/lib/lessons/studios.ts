/**
 * Server-safe catalog of the Lab's interactive STUDIOS — the "pick a concept and
 * build it" workbenches (distinct from lessons, which are declarative content).
 * Metadata only (no client code), so the gallery server page can read it. The
 * client registry that maps id → workbench component lives in
 * `src/components/lab/studios/index.tsx`. Keep the ids in sync.
 *
 * Studios reuse the lesson progress + tutor APIs by namespacing their id as
 * `studio:<id>` (see studioProgressId) — no DB change.
 */

import type { GlossaryTerm } from "./types";

export interface StudioMeta {
  id: string;
  title: string;
  /** One-liner for the gallery card. */
  blurb: string;
  /** Short "what you'll build" line for the intro card. */
  tagline?: string;
  /** "What you'll get" bullets for the first-visit intro overlay. */
  objectives?: string[];
  /** Plain-language definitions for the in-studio "Words" panel. */
  glossary?: GlossaryTerm[];
  /** The ML idea being built. */
  concept: string;
  /** The thing the student is working toward (shown in the workbench header). */
  goal: string;
  /** Lucide icon key (resolved in the studio gallery's own allow-list). */
  icon: string;
  level: "beginner" | "intermediate" | "advanced";
  estMinutes: number;
  order: number;
}

export const STUDIO_CATALOG: StudioMeta[] = [
  {
    id: "tree",
    title: "Decision Tree Studio",
    blurb: "Grow a decision tree branch by branch to sort a pile of pets — and watch it get smarter.",
    tagline: "Grow a tree of yes/no questions that sorts pets — cats, dogs and rabbits.",
    objectives: [
      "What a decision tree is — a chain of simple yes/no questions",
      "How each split sorts the pets into tidier groups",
      "Why too many splits = memorizing (overfitting), not learning",
    ],
    glossary: [
      { term: "Decision tree", def: "A chain of yes/no questions that sorts things into groups, one question at a time." },
      { term: "Split", def: "One yes/no question, like 'are the ears bigger than 5cm?' It cuts a group in two." },
      { term: "Clue (feature)", def: "A measurement you can ask about — here: weight, ear size, or tail length." },
      { term: "Leaf", def: "An end of the tree where a group lands and gets a label (cat, dog, or rabbit)." },
      { term: "Overfitting", def: "When the tree memorizes the exact practice pets instead of learning the pattern — it then flops on new pets." },
      { term: "New pets (test set)", def: "Pets the tree never saw while building. Doing well on these is what really counts." },
    ],
    concept: "decision trees",
    goal: "Reach 85% accuracy on pets it has never seen",
    icon: "GitBranch",
    level: "beginner",
    estMinutes: 12,
    order: 1,
  },
  {
    id: "regression",
    title: "Regression Studio",
    blurb: "Build a predictor: dial a straight line into a bendy curve until it hugs the data — without overfitting.",
    tagline: "Dial a line into a curve that predicts a number from the data.",
    objectives: [
      "What a regression line/curve predicts (a number, not a category)",
      "How 'bendiness' changes how well it fits",
      "The difference between too-simple (underfitting) and too-bendy (overfitting)",
    ],
    glossary: [
      { term: "Regression", def: "Predicting a number (like a price or a height) instead of a category." },
      { term: "Line of best fit", def: "The line/curve that gets as close as possible to all the dots." },
      { term: "Bendiness (degree)", def: "How wiggly the curve can be. 1 = a straight line; higher = more bends." },
      { term: "Error", def: "How far off the predictions are, on average. Smaller is better." },
      { term: "Underfitting", def: "The curve is too simple to follow the data — it misses the pattern." },
      { term: "Overfitting", def: "The curve is too bendy and chases the noise — great on its dots, bad on new ones." },
      { term: "New points (test set)", def: "Dots the curve never trained on. Low error on these is the real goal." },
    ],
    concept: "regression models",
    goal: "Get the error on new points under 0.5",
    icon: "LineChart",
    level: "beginner",
    estMinutes: 8,
    order: 2,
  },
  {
    id: "cluster",
    title: "Clustering Studio",
    blurb: "No labels — just dots. Set K, drop centers, and run K-Means until the hidden groups appear.",
    tagline: "No labels — let the computer discover the hidden groups on its own.",
    objectives: [
      "What clustering finds in data that has no labels",
      "How K-Means groups dots round by round",
      "Why the number of groups (K) you pick matters",
    ],
    glossary: [
      { term: "Clustering", def: "Finding natural groups in data when nothing is labeled ahead of time." },
      { term: "K", def: "How many groups you tell it to look for." },
      { term: "Center (centroid)", def: "The ✕ that sits at the middle of a group. Dots join their nearest ✕." },
      { term: "Round", def: "One pass: every dot joins its nearest ✕, then each ✕ hops to the middle of its dots." },
      { term: "Spread", def: "How far dots sit from their group's center, added up. Tighter groups = smaller spread." },
      { term: "Unlabeled data", def: "Dots with no answer attached — the computer has to find the structure itself." },
    ],
    concept: "clustering algorithms",
    goal: "Uncover the 3 hidden groups",
    icon: "Boxes",
    level: "intermediate",
    estMinutes: 8,
    order: 3,
  },
  {
    id: "network",
    title: "Neural Net Studio",
    blurb: "One neuron can't crack it. Add hidden neurons, hit Train, and watch a real network bend the boundary.",
    tagline: "Wire up neurons until they curve a boundary around a ring.",
    objectives: [
      "What a neuron and a network are",
      "Why one neuron can only draw a straight line (and fails on a ring)",
      "How adding hidden neurons lets the boundary bend into a curve",
    ],
    glossary: [
      { term: "Neuron", def: "A tiny decision-maker. One neuron can only draw a single straight line." },
      { term: "Neural network", def: "Many neurons wired together, so their straight lines combine into curves." },
      { term: "Hidden neurons", def: "The neurons in the middle. More of them = a more bendy boundary." },
      { term: "Training", def: "The network adjusts its dials over many rounds to make fewer mistakes." },
      { term: "Decision boundary", def: "The line/curve that separates one class from the other (the colored regions)." },
      { term: "Accuracy", def: "The share of dots it gets on the right side. 90% is the goal here." },
    ],
    concept: "neural networks",
    goal: "Separate the ring from the core (90%)",
    icon: "Network",
    level: "advanced",
    estMinutes: 10,
    order: 4,
  },
];

export const STUDIO_IDS: string[] = STUDIO_CATALOG.map((s) => s.id);

export function isStudioId(id: string): boolean {
  return STUDIO_IDS.includes(id);
}

export function getStudioMeta(id: string): StudioMeta | undefined {
  return STUDIO_CATALOG.find((s) => s.id === id);
}

/** The lessonId used to persist a studio's completion via /api/lab/progress. */
export function studioProgressId(id: string): string {
  return `studio:${id}`;
}
