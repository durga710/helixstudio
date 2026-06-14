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
import type { GlossaryTerm, Lesson, LessonManifest, LessonStep, RecallCheck } from "./types";
import { isWidgetId } from "./widgets";

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;

const GlossarySchema = z
  .array(z.object({ term: z.string().min(1).max(60), def: z.string().min(1).max(400) }))
  .max(30)
  .optional();

export const ManifestSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  blurb: z.string().min(1).max(300),
  level: z.enum(LEVELS),
  estMinutes: z.number().int().min(1).max(180),
  icon: z.string().min(1).max(40),
  concept: z.string().min(1).max(60),
  order: z.number().int(),
  objectives: z.array(z.string().min(1).max(200)).max(8).optional(),
  glossary: GlossarySchema,
});

const RecallSchema = z.object({
  question: z.string().min(1).max(800),
  choices: z.array(z.string().min(1).max(400)).min(2).max(6),
  answer: z.number().int().min(0),
  explain: z.string().max(1500).optional(),
});

export const StepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("explain"), title: z.string().max(160).optional(), body: z.string().min(1).max(5000) }),
  z.object({
    kind: z.literal("widget"),
    widget: z.string().refine(isWidgetId, "unknown widget"),
    title: z.string().max(160).optional(),
    body: z.string().max(3000).optional(),
    youWillDo: z.string().max(200).optional(),
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
  z.object({
    kind: z.literal("predict"),
    title: z.string().max(160).optional(),
    prompt: z.string().min(1).max(800),
    choices: z.array(z.string().min(1).max(400)).min(2).max(6),
    afterPick: z.string().max(600).optional(),
    youWillDo: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("reflect"),
    title: z.string().max(160).optional(),
    prompt: z.string().min(1).max(800),
    placeholder: z.string().max(200).optional(),
    recall: RecallSchema,
    youWillDo: z.string().max(200).optional(),
  }),
]);

export const LessonDocSchema = z.object({
  manifest: ManifestSchema,
  steps: z.array(StepSchema).min(1).max(80),
});

export type LessonDoc = z.infer<typeof LessonDocSchema>;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const pickChoices = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((c) => str(c, 400)).filter((c): c is string => Boolean(c)).slice(0, 6) : [];

const clampAnswer = (v: unknown, len: number): number => {
  const a = typeof v === "number" ? Math.round(v) : 0;
  return a < 0 || a >= len ? 0 : a;
};

function coerceRecall(raw: unknown): RecallCheck | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const question = str(r.question, 800);
  const choices = pickChoices(r.choices);
  if (!question || choices.length < 2) return null;
  return { question, choices, answer: clampAnswer(r.answer, choices.length), explain: str(r.explain, 1500) ?? undefined };
}

/** Best-effort repair of a raw object (e.g. model output) into a valid Lesson.
 * Returns null only if nothing usable remains. */
export function coerceLessonDoc(raw: unknown, fallbackId: string): Lesson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const m = (r.manifest && typeof r.manifest === "object" ? r.manifest : r) as Record<string, unknown>;

  const level = LEVELS.includes(m.level as (typeof LEVELS)[number]) ? (m.level as LessonManifest["level"]) : "beginner";
  const objectives = Array.isArray(m.objectives)
    ? m.objectives.map((o) => str(o, 200)).filter((o): o is string => Boolean(o)).slice(0, 8)
    : [];
  const glossary: GlossaryTerm[] = Array.isArray(m.glossary)
    ? (m.glossary as unknown[])
        .map((g) => {
          if (!g || typeof g !== "object") return null;
          const gg = g as Record<string, unknown>;
          const term = str(gg.term, 60);
          const def = str(gg.def, 400);
          return term && def ? { term, def } : null;
        })
        .filter((g): g is GlossaryTerm => Boolean(g))
        .slice(0, 30)
    : [];
  const manifest: LessonManifest = {
    id: fallbackId,
    title: str(m.title, 120) ?? "Untitled lesson",
    blurb: str(m.blurb, 300) ?? "A hands-on lesson.",
    level,
    estMinutes: typeof m.estMinutes === "number" ? Math.min(180, Math.max(1, Math.round(m.estMinutes))) : 10,
    icon: str(m.icon, 40) ?? "Sparkles",
    concept: str(m.concept, 60) ?? "ai",
    order: typeof m.order === "number" ? m.order : 100,
    ...(objectives.length && { objectives }),
    ...(glossary.length && { glossary }),
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
          youWillDo: str(st.youWillDo, 200) ?? undefined,
          config: st.config && typeof st.config === "object" ? (st.config as Record<string, unknown>) : undefined,
        });
      }
    } else if (st.kind === "quiz") {
      const question = str(st.question, 800);
      const choices = pickChoices(st.choices);
      if (question && choices.length >= 2) {
        steps.push({ kind: "quiz", title, question, choices, answer: clampAnswer(st.answer, choices.length), explain: str(st.explain, 1500) ?? undefined });
      }
    } else if (st.kind === "predict") {
      const prompt = str(st.prompt, 800);
      const choices = pickChoices(st.choices);
      if (prompt && choices.length >= 2) {
        steps.push({ kind: "predict", title, prompt, choices, afterPick: str(st.afterPick, 600) ?? undefined, youWillDo: str(st.youWillDo, 200) ?? undefined });
      }
    } else if (st.kind === "reflect") {
      const prompt = str(st.prompt, 800);
      const recall = coerceRecall(st.recall);
      if (prompt && recall) {
        steps.push({ kind: "reflect", title, prompt, placeholder: str(st.placeholder, 200) ?? undefined, recall, youWillDo: str(st.youWillDo, 200) ?? undefined });
      }
    }
  }

  if (steps.length === 0) return null;
  return { manifest, steps };
}
