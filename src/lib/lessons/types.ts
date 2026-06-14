/**
 * Types for the AI Lab's lessons. Lessons are declarative CONTENT (data), not
 * code — an ordered list of steps that compose a small set of reusable widgets.
 * New topics = new content files; the widget vocabulary is the only thing that
 * needs engineering. Bundled into registry.generated.ts by gen-lessons.mjs.
 */

/** A vocabulary term + plain-language definition. Surfaced as a tap-to-read
 * "Words" panel so jargon is always one click from a kid-friendly meaning —
 * never assumed (the documented #1 reason beginners feel lost). */
export interface GlossaryTerm {
  term: string;
  def: string;
}

export interface LessonManifest {
  id: string;
  title: string;
  /** One-line hook shown on the gallery card. */
  blurb: string;
  level: "beginner" | "intermediate" | "advanced";
  estMinutes: number;
  /** Lucide icon key, resolved to a component in the client. */
  icon: string;
  /** The ML concept this teaches (e.g. "classification"). */
  concept: string;
  /** Curriculum sequence position (gallery sorts ascending). */
  order: number;
  /** "What you'll learn" bullets — shown on the lesson's framing/intro card. */
  objectives?: string[];
  /** Plain-language definitions surfaced via the in-lesson "Words" panel. */
  glossary?: GlossaryTerm[];
  /** Set for teacher/AI-authored (DB) lessons; absent for bundled ones. */
  authored?: boolean;
  /** Author display name, for authored lessons ("from your teacher"). */
  author?: string;
}

/** A retrieval check — a multiple-choice question used to make the learner
 * RECALL (not just re-read). Shared by `quiz` and the recall half of `reflect`. */
export interface RecallCheck {
  question: string;
  choices: string[];
  answer: number;
  explain?: string;
}

/**
 * A single step in the guided flow. Markdown is allowed in body/prompt text.
 * The step vocabulary encodes a pedagogical arc:
 *   explain → narration/concept   widget → hands-on interaction
 *   predict → guess BEFORE being told (primes learning)
 *   quiz    → a recognition check   reflect → explain-it-back + recall
 * `youWillDo` is a one-line "here's what you'll do" frame shown above the step
 * so a learner is never dropped in cold.
 */
export type LessonStep =
  | { kind: "explain"; title?: string; body: string }
  | { kind: "widget"; widget: string; title?: string; body?: string; youWillDo?: string; config?: Record<string, unknown> }
  | { kind: "quiz"; title?: string; question: string; choices: string[]; answer: number; explain?: string }
  | { kind: "predict"; title?: string; prompt: string; choices: string[]; afterPick?: string; youWillDo?: string }
  | { kind: "reflect"; title?: string; prompt: string; placeholder?: string; recall: RecallCheck; youWillDo?: string };

export interface Lesson {
  manifest: LessonManifest;
  steps: LessonStep[];
}
