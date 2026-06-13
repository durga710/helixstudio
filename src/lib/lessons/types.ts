/**
 * Types for the AI Lab's lessons. Lessons are declarative CONTENT (data), not
 * code — an ordered list of steps that compose a small set of reusable widgets.
 * New topics = new content files; the widget vocabulary is the only thing that
 * needs engineering. Bundled into registry.generated.ts by gen-lessons.mjs.
 */

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
}

/** A single step in the guided flow. Markdown is allowed in `body`/`explain`. */
export type LessonStep =
  | { kind: "explain"; title?: string; body: string }
  | { kind: "widget"; widget: string; title?: string; body?: string; config?: Record<string, unknown> }
  | { kind: "quiz"; title?: string; question: string; choices: string[]; answer: number; explain?: string };

export interface Lesson {
  manifest: LessonManifest;
  steps: LessonStep[];
}
