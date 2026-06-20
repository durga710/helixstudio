/**
 * AI Lab tutor — a patient, kid-friendly helper aware of the student's current
 * lesson + lab state. Reuses the one-shot AI plumbing (no tools).
 *   GET  → { available } so the UI only shows the tutor when an AI key resolves.
 *   POST → answer a question (graceful: returns unavailable when no key/budget).
 *
 * Honors the platform key policy (admin / own key / local) + token budget; a
 * dedicated tutor key + per-student pricing is a later phase.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";
import { resolveAiPrefs, runOneShot } from "@/lib/ai-agent";
import { checkTokenBudget } from "@/lib/token-budget";
import { recordAiUsage } from "@/lib/ai-usage";
import { getLessonForViewer } from "@/lib/lessons/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  lessonId: z.string().min(1).max(80),
  stepIndex: z.number().int().min(0).max(200).optional(),
  concept: z.string().max(80).optional(),
  question: z.string().min(1).max(1000),
  state: z.record(z.string(), z.unknown()).optional(),
});

const SYSTEM = `You are "Helix Coach", a warm, patient teacher sitting beside a young student (about 10–14) while they play a hands-on AI learning game. You guide, explain, and check understanding. Rules:
- Use plain, friendly language a 10–14 year old understands. No jargon (say "examples" not "training data", "rounds" not "epochs").
- Keep replies SHORT — 2–4 sentences. Warm and encouraging; never condescending.
- When EXPLAINING a concept: give the simplest version plus one tiny everyday analogy. You can mention the on-screen picture/diagram they can open.
- When CHECKING understanding (you were asked to quiz them): ask ONE short question and stop — do not answer it yourself. When they reply, react warmly and gently correct anything missed.
- Otherwise HINT and guide; don't just hand over the answer. Ask a gentle question back when it helps them think.
- Stay on the lesson's topic. If asked something off-topic, gently steer back.`;

export async function GET() {
  const g = await guard("lab.tutor.status", { limit: 600, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  try {
    const prefs = await resolveAiPrefs(g.user.id);
    const budget = await checkTokenBudget(g.user.id);
    return ok({ available: Boolean(prefs.apiKey) && budget.ok });
  } catch {
    return ok({ available: false });
  }
}

export async function POST(req: Request) {
  const g = await guard("lab.tutor", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { lessonId, stepIndex, concept, question, state } = parsed.data;

  const budget = await checkTokenBudget(g.user.id);
  if (!budget.ok) return ok({ ok: false, unavailable: true });

  const prefs = await resolveAiPrefs(g.user.id);
  if (!prefs.apiKey) return ok({ ok: false, unavailable: true });

  const lesson = await getLessonForViewer(lessonId, g.user.id);
  const step = lesson && stepIndex !== undefined ? lesson.steps[stepIndex] : undefined;
  const stepTitle = step && "title" in step ? step.title : undefined;
  const topic = lesson?.manifest.concept ?? concept;
  const contextLine = [
    lesson ? `Module: "${lesson.manifest.title}" (about ${lesson.manifest.concept}).` : topic ? `Topic: ${topic}.` : "",
    stepTitle ? `Current step: ${stepTitle}.` : "",
    state && Object.keys(state).length ? `What the student is doing right now: ${JSON.stringify(state).slice(0, 500)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await runOneShot({
    provider: prefs.provider,
    model: prefs.model,
    apiKey: prefs.apiKey,
    baseUrl: prefs.baseUrl,
    maxTokens: 400,
    system: contextLine ? `${SYSTEM}\n\nContext:\n${contextLine}` : SYSTEM,
    user: question,
  });
  if ("error" in res) return ok({ ok: false, error: "The tutor couldn't answer right now — try again." });

  if (res.tokensUsed > 0) {
    void recordAiUsage({
      userId: g.user.id,
      tokens: res.tokensUsed,
      kind: "tutor",
      provider: prefs.provider,
      model: prefs.model,
    });
  }
  return ok({ ok: true, text: res.text });
}
