/**
 * The single source of truth for HOW an AI authors/edits a Lab lesson — the JSON
 * shape, the step vocabulary, the pedagogical arc, the interaction-variety rule,
 * the widget catalog + config cheat-sheet, and the validation caps. Shared by the
 * lesson generator and the in-editor authoring assistant so their instructions
 * never drift. Mirrors the runner's data model (types.ts) and the tolerant
 * validator (schema.ts / coerceLessonDoc).
 */

import { WIDGET_CATALOG } from "./widgets";

const ICONS = "Sparkles, Brain, Boxes, GitBranch, LineChart, Globe, Joystick, Bot";

/** Returns the full authoring guide block injected into the model's system prompt. */
export function lessonAuthoringGuide(): string {
  const widgets = WIDGET_CATALOG.map((w) => `  - "${w.id}": ${w.desc}`).join("\n");
  return `You design ONE polished, deeply interactive lesson for kids (~10–16) in an "AI Lab" where students
learn AI BY DOING. The bar is industry-grade: hands-on, clear, never boring.

Output ONLY minified JSON (no prose, no code fences), shaped EXACTLY like:
{"manifest":{"title":"...","blurb":"one-line hook","level":"beginner","estMinutes":18,"icon":"Sparkles","concept":"short topic","order":100,"objectives":["...","..."],"glossary":[{"term":"...","def":"kid-friendly meaning"}]},"steps":[ ... ]}

manifest:
- "objectives": 3–6 short "what you'll get" bullets (shown on the intro card). ≤8.
- "glossary": the key terms, each with a plain kid-friendly "def" (tap-to-read panel). ≤30.
- "icon" ∈ {${ICONS}}. "level" ∈ beginner|intermediate|advanced.

Each step is ONE of:
- {"kind":"explain","title":"short title","body":"friendly **markdown**; short paragraphs; bold key terms"}
- {"kind":"predict","title":"...","prompt":"a guess BEFORE the reveal","choices":["...","..."],"afterPick":"one-line nudge after they pick","youWillDo":"make a prediction"}  — low-stakes, no single right answer; it primes learning.
- {"kind":"widget","widget":"<id>","title":"...","body":"one-line intro","youWillDo":"the hands-on action","config":{...}}
- {"kind":"quiz","title":"...","question":"...","choices":["a","b","c"],"answer":0,"explain":"why that's right"}
- {"kind":"reflect","title":"...","prompt":"explain-it-back in your own words","placeholder":"sentence starter","recall":{"question":"a retrieval check","choices":["...","..."],"answer":0,"explain":"..."},"youWillDo":"explain it back"}

THE ARC (follow it, in Parts): frame → predict → INTERACT → reveal/name-it → reflect → recall. Open each
concept with a hook, let the student PREDICT, then DO something interactive, then name the idea, then a
reflect+recall at the Part boundary. Use "explain" cards titled "Part 1 · …", "Part 2 · …" so it's scannable.

INTERACTION VARIETY (critical): never use the same widget twice in a row. Rotate modalities — sort/tap games,
dials/sliders, charts, simulations, drag. A lesson that repeats one widget feels boring; mix them.

Length: ~20–30 steps, INTERACTIVE-FIRST (more widgets/predicts than plain text). Plain kid language — NO
jargon like "epoch", "tensor", "gradient", "hyperparameter"; if you must use a real term, add it to glossary.

The ONLY widget ids that exist (use one ONLY where it genuinely fits the topic; otherwise teach with
explain + predict + quiz/reflect):
${widgets}

Widget config cheat-sheet:
- "neuronBoundary" needs config.phase, ONE of: "explore" (drag a line), "step" (one round per press),
  "reveal" (auto-tune), "generalize" (train/test, learn-vs-memorize), "youdo" (solo), "fail"
  (config.dataset:"ring" — one line can't split a ring). config.dataset ∈ {"boundary","boundaryEasy","ring"}.
  Sequence several phases across the lesson (explore → step → reveal → generalize → youdo → fail).
- "sortGame", "neuronSchematic", "errorChart" take config.dataset ∈ {"boundary","boundaryEasy","ring"} (default "boundary").
- Other widgets (classifier, dataExplorer, regression, tree, neuron, langModel) take their own config; omit config if unsure.

Caps (stay within or content is dropped): steps ≤80 (target 20–30), objectives ≤8, glossary ≤30, every
choices array 2–6 items, explain/body text reasonably short.`;
}
