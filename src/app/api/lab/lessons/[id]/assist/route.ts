/**
 * The in-editor AI authoring assistant (premium teachers). Given the lesson the
 * teacher is editing + an instruction or question, the AI either EDITS the whole
 * lesson (returns a full revised, validated doc the editor loads for review) or
 * ANSWERS a question. Never saves — the teacher reviews + saves.
 *
 * Gated like generation: author of the lesson + premium (Pro/Team OR paid class)
 * + token budget + a resolvable AI key. Premium feature, so the token budget is
 * generous.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { isAdminEmail } from "@/lib/admin";
import { canUseAiAuthoring } from "@/lib/billing";
import { checkTokenBudget } from "@/lib/token-budget";
import { recordAiUsage } from "@/lib/ai-usage";
import { resolveAiPrefs, runOneShot } from "@/lib/ai-agent";
import { coerceLessonDoc } from "@/lib/lessons/schema";
import { lessonAuthoringGuide } from "@/lib/lessons/authoring-guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

const Schema = z.object({
  instruction: z.string().min(1).max(800),
  manifest: z.unknown(),
  steps: z.unknown(),
});

function systemPrompt(currentDoc: string): string {
  return `You are an expert co-author helping a teacher build ONE interactive AI lesson. You can either EDIT the lesson or ANSWER a question about it.

${lessonAuthoringGuide()}

The teacher's CURRENT lesson (JSON) is:
${currentDoc}

Respond with ONLY minified JSON — no prose, no code fences — exactly ONE of:
- {"mode":"edit","summary":"one short sentence on what you changed","lesson":{"manifest":{...},"steps":[...]}}  — return the FULL updated lesson (manifest + ALL steps), keeping everything the teacher did NOT ask to change.
- {"mode":"answer","text":"a short, friendly answer (2–5 sentences)"}
If the teacher asks to add / remove / rewrite / reorder / simplify / fix anything → EDIT. If they ask a question → ANSWER.`;
}

export async function POST(req: Request, { params }: Params) {
  const g = await guard("lab.lesson.assist", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  const { id } = await params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { instruction, manifest, steps } = parsed.data;

  const row = await db().lesson.findUnique({ where: { id }, select: { authorId: true, spaceId: true } });
  if (!row || row.authorId !== g.user.id || !row.spaceId) return apiErrors.notFound("Lesson");

  const space = await db().space.findUnique({
    where: { id: row.spaceId },
    select: { ownerId: true, plan: true, seats: true, currentPeriodEnd: true },
  });
  if (!space) return apiErrors.notFound("Classroom");

  const budget = await checkTokenBudget(g.user.id);
  if (!budget.ok) return apiErrors.badRequest(budget.error);

  const gate = canUseAiAuthoring({ tier: budget.user?.tier ?? "free", isAdmin: isAdminEmail(g.user.email), space });
  if (!gate.allowed) return apiErrors.upgradeRequired(gate.reason!);

  const prefs = await resolveAiPrefs(g.user.id);
  if (!prefs.apiKey) {
    return apiErrors.badRequest("Add your AI key in Settings to use the assistant (or ask an admin).");
  }

  const currentDoc = JSON.stringify({ manifest, steps }).slice(0, 24000);

  const res = await runOneShot({
    provider: prefs.provider,
    model: prefs.model,
    apiKey: prefs.apiKey,
    baseUrl: prefs.baseUrl,
    maxTokens: 16000,
    system: systemPrompt(currentDoc),
    user: instruction,
  });
  if ("error" in res) return apiErrors.badRequest("The assistant couldn't respond — try again.");

  if (res.tokensUsed > 0) {
    void recordAiUsage({
      userId: g.user.id,
      tokens: res.tokensUsed,
      kind: "lesson_assist",
      provider: prefs.provider,
      model: prefs.model,
    });
  }

  const cleaned = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    // Model answered in prose — treat it as an answer rather than failing.
    return ok({ mode: "answer", text: res.text.slice(0, 2000) });
  }

  const o = obj as Record<string, unknown>;
  if (o?.mode === "edit") {
    const doc = coerceLessonDoc(o.lesson, id);
    if (!doc) {
      return ok({ mode: "answer", text: "I drafted a change but it didn't come out valid — try saying what you want a bit differently." });
    }
    return ok({
      mode: "edit",
      summary: typeof o.summary === "string" ? o.summary.slice(0, 200) : "Updated the lesson.",
      lesson: { manifest: doc.manifest, steps: doc.steps },
    });
  }

  const text = typeof o?.text === "string" ? o.text : res.text;
  return ok({ mode: "answer", text: String(text).slice(0, 2000) });
}
