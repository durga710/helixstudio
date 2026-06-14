/**
 * Build a lesson with AI (premium teachers). Generates a structured draft from
 * a short prompt, validates/repairs it (text + KNOWN widgets only), and saves a
 * draft Lesson owned by the teacher and scoped to their classroom.
 *
 * Gated: caller must own the classroom Space + be premium (Pro/Team OR paid
 * class) + within token budget + have a resolvable AI key (admin/own key; a
 * dedicated platform key for premium is a later phase).
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

const Schema = z.object({ spaceId: z.string().min(1).max(60), prompt: z.string().min(3).max(600) });

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "lesson"
  );
}

export async function POST(req: Request) {
  const g = await guard("lab.lesson.generate", { limit: 40, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { spaceId, prompt } = parsed.data;

  const space = await db().space.findUnique({
    where: { id: spaceId },
    select: { ownerId: true, plan: true, seats: true, currentPeriodEnd: true },
  });
  if (!space || space.ownerId !== g.user.id) return apiErrors.notFound("Classroom");

  const budget = await checkTokenBudget(g.user.id);
  if (!budget.ok) return apiErrors.badRequest(budget.error);

  const gate = canUseAiAuthoring({ tier: budget.user?.tier ?? "free", isAdmin: isAdminEmail(g.user.email), space });
  if (!gate.allowed) return apiErrors.upgradeRequired(gate.reason!);

  const prefs = await resolveAiPrefs(g.user.id);
  if (!prefs.apiKey) {
    return apiErrors.badRequest("Add your AI key in Settings to generate lessons (or ask an admin).");
  }

  const res = await runOneShot({
    provider: prefs.provider,
    model: prefs.model,
    apiKey: prefs.apiKey,
    baseUrl: prefs.baseUrl,
    maxTokens: 14000,
    system: lessonAuthoringGuide(),
    user: `Make a lesson about: ${prompt}`,
  });
  if ("error" in res) return apiErrors.badRequest("The AI couldn't build that lesson — try again or rephrase.");

  if (res.tokensUsed > 0) {
    void recordAiUsage({
      userId: g.user.id,
      tokens: res.tokensUsed,
      kind: "lesson_generation",
      provider: prefs.provider,
      model: prefs.model,
    });
  }

  const cleaned = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let rawObj: unknown;
  try {
    rawObj = JSON.parse(cleaned);
  } catch {
    return apiErrors.badRequest("The AI's lesson came back malformed — try again.");
  }
  const doc = coerceLessonDoc(rawObj, slugify(prompt));
  if (!doc) return apiErrors.badRequest("The AI's lesson had no usable steps — try again.");

  const row = await db().lesson.create({
    data: {
      authorId: g.user.id,
      spaceId,
      title: doc.manifest.title,
      status: "draft",
      source: "ai",
      manifest: doc.manifest as unknown as object,
      steps: doc.steps as unknown as object,
    },
    select: { id: true },
  });

  return ok({ id: row.id, title: doc.manifest.title, steps: doc.steps.length });
}
