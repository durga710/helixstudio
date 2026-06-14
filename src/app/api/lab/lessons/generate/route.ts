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
import { WIDGET_CATALOG } from "@/lib/lessons/widgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({ spaceId: z.string().min(1).max(60), prompt: z.string().min(3).max(600) });

const ICONS = "Sparkles, Brain, Boxes, GitBranch, LineChart, Globe, Joystick";

function systemPrompt(): string {
  const widgets = WIDGET_CATALOG.map((w) => `  - "${w.id}": ${w.desc}`).join("\n");
  return `You design ONE short, interactive lesson for kids (ages ~10–16) in an "AI Lab" where students learn AI by doing.
Return ONLY minified JSON — no prose, no code fences — shaped EXACTLY like:
{"manifest":{"title":"...","blurb":"one-line hook","level":"beginner","estMinutes":12,"icon":"Sparkles","concept":"short topic","order":100},"steps":[ ... ]}
Each step is ONE of:
- {"kind":"explain","title":"optional short title","body":"friendly markdown teaching text; short paragraphs; **bold** key terms"}
- {"kind":"quiz","title":"optional","question":"...","choices":["a","b","c"],"answer":0,"explain":"why that's right"}
- {"kind":"widget","widget":"<id>","title":"optional","body":"one-line intro"}
The ONLY widget ids that exist (use one ONLY where it genuinely fits; otherwise teach with explain + quiz):
${widgets}
Rules: 12–18 steps; mostly explain + quiz; a clear arc (hook → teach → check understanding → reflect); plain kid language (NO jargon like "epoch", "tensor", "hyperparameter"); a quiz every few steps; end with a short recap. "icon" must be one of: ${ICONS}. "level" is beginner | intermediate | advanced.`;
}

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
    maxTokens: 4000,
    system: systemPrompt(),
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
