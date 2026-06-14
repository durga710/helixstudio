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

export interface StudioMeta {
  id: string;
  title: string;
  /** One-liner for the gallery card. */
  blurb: string;
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
    concept: "decision trees",
    goal: "Reach 85% accuracy on pets it has never seen",
    icon: "GitBranch",
    level: "beginner",
    estMinutes: 12,
    order: 1,
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
