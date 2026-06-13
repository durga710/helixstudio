/**
 * Validation for authored lessons (AI-generated or teacher-edited). Two paths:
 *   - `LessonDocSchema` (zod) — strict-ish validation for teacher PATCH saves.
 *   - `coerceLessonDoc` — tolerant repair of model output (drops malformed
 *     steps + widget steps that reference an unknown widget) so a slightly-off
 *     generation still yields a usable lesson.
 *
 * Authored lessons can ONLY compose text + KNOWN widgets — never arbitrary
 * code — so they're safe to render in the student Lab.
 */

import { z } from "zod";
import type { Lesson, LessonManifest, LessonStep } from "./types";
import { isWidgetId } from "./widgets";

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;

export const ManifestSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  blurb: z.string().min(1).max(300),
  level: z.enum(LEVELS),
  estMinutes: z.number().int().min(1).max(180),
  icon: z.string().min(1).max(40),
  concept: z.string().min(1).max(60),
  order: z.number().int(),
});

export const StepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("explain"), title: z.string().max(160).optional(), body: z.string().min(1).max(5000) }),
  z.object({
    kind: z.literal("widget"),
    widget: z.string().refine(isWidgetId, "unknown widget"),
    title: z.string().max(160).optional(),
    body: z.string().max(3000).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal("quiz"),
    title: z.string().max(160).optional(),
    question: z.string().min(1).max(800),
    choices: z.array(z.string().min(1).max(400)).min(2).max(6),
    answer: z.number().int().min(0),
    explain: z.string().max(1500).optional(),
  }),
]);

export const LessonDocSchema = z.object({
  manifest: ManifestSchema,
  steps: z.array(StepSchema).min(1).max(80),
});

export type LessonDoc = z.infer<typeof LessonDocSchema>;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Best-effort repair of a raw object (e.g. model output) into a valid Lesson.
 * Returns null only if nothing usable remains. */
export function coerceLessonDoc(raw: unknown, fallbackId: string): Lesson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const m = (r.manifest && typeof r.manifest === "object" ? r.manifest : r) as Record<string, unknown>;

  const level = LEVELS.includes(m.level as (typeof LEVELS)[number]) ? (m.level as LessonManifest["level"]) : "beginner";
  const manifest: LessonManifest = {
    id: fallbackId,
    title: str(m.title, 120) ?? "Untitled lesson",
    blurb: str(m.blurb, 300) ?? "A hands-on lesson.",
    level,
    estMinutes: typeof m.estMinutes === "number" ? Math.min(180, Math.max(1, Math.round(m.estMinutes))) : 10,
    icon: str(m.icon, 40) ?? "Sparkles",
    concept: str(m.concept, 60) ?? "ai",
    order: typeof m.order === "number" ? m.order : 100,
    authored: true,
  };

  const rawSteps = Array.isArray(r.steps) ? r.steps : Array.isArray(m.steps) ? (m.steps as unknown[]) : [];
  const steps: LessonStep[] = [];
  for (const s of rawSteps) {
    if (!s || typeof s !== "object") continue;
    const st = s as Record<string, unknown>;
    const title = str(st.title, 160) ?? undefined;
    if (st.kind === "explain") {
      const body = str(st.body, 5000);
      if (body) steps.push({ kind: "explain", title, body });
    } else if (st.kind === "widget") {
      const widget = str(st.widget, 60);
      if (widget && isWidgetId(widget)) {
        steps.push({
          kind: "widget",
          widget,
          title,
          body: str(st.body, 3000) ?? undefined,
          config: st.config && typeof st.config === "object" ? (st.config as Record<string, unknown>) : undefined,
        });
      }
    } else if (st.kind === "quiz") {
      const question = str(st.question, 800);
      const choices = Array.isArray(st.choices)
        ? st.choices.map((c) => str(c, 400)).filter((c): c is string => Boolean(c)).slice(0, 6)
        : [];
      if (question && choices.length >= 2) {
        let answer = typeof st.answer === "number" ? Math.round(st.answer) : 0;
        if (answer < 0 || answer >= choices.length) answer = 0;
        steps.push({ kind: "quiz", title, question, choices, answer, explain: str(st.explain, 1500) ?? undefined });
      }
    }
  }

  if (steps.length === 0) return null;
  return { manifest, steps };
}
