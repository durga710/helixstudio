/**
 * AI-mode "guide" — the editor's AI workspace chat. Like the tutor, but it can
 * also NAVIGATE: when the student wants to learn or build a concept, it picks
 * the matching Studio so the workbench opens on the right. Returns
 *   { reply, openStudio? } — openStudio is a studio id from STUDIO_CATALOG.
 *
 *   GET  → { available } (only show the live guide when an AI key resolves)
 *   POST → { ok, reply, openStudio? } | { ok:false, unavailable:true }
 *
 * Honors the platform-key policy + token budget; metered as "lab_guide".
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";
import { resolveAiPrefs, runOneShot } from "@/lib/ai-agent";
import { checkTokenBudget } from "@/lib/token-budget";
import { recordAiUsage } from "@/lib/ai-usage";
import { STUDIO_CATALOG, isStudioId } from "@/lib/lessons/studios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  message: z.string().min(1).max(1000),
  /** The studio currently open on the right (for context), if any. */
  openStudio: z.string().max(40).optional(),
  /** Live state of the open studio (accuracy, etc.), if any. */
  state: z.record(z.string(), z.unknown()).optional(),
});

function systemPrompt(): string {
  const list = STUDIO_CATALOG.map((s) => `- id "${s.id}": ${s.title} — ${s.concept}. Goal: ${s.goal}.`).join("\n");
  return `You are "Helix Guide", a warm, patient AI teacher inside a hands-on ML lab for young learners (10–14). The student builds real models on interactive STUDIOS. You can OPEN a studio for them.

Available studios:
${list}

Rules:
- Plain, friendly language. No jargon. Keep replies SHORT (2–4 sentences). Encourage.
- If the student wants to learn, build, or try a concept that matches a studio, set "openStudio" to that studio's id and tell them what to do first. If they're already in a studio, help them with it (hints, not answers).
- If nothing matches, just answer or suggest a studio by name (leave openStudio empty).
- Reply with ONLY minified JSON: {"reply":"...","openStudio":"<id or omit>"}. No prose outside the JSON, no code fences.`;
}

export async function GET() {
  const g = await guard("lab.guide.status", { limit: 600, windowMs: 60 * 60 * 1000 });
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
  const g = await guard("lab.guide", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { message, openStudio, state } = parsed.data;

  const budget = await checkTokenBudget(g.user.id);
  if (!budget.ok) return ok({ ok: false, unavailable: true });

  const prefs = await resolveAiPrefs(g.user.id);
  if (!prefs.apiKey) return ok({ ok: false, unavailable: true });

  const context = [
    openStudio && isStudioId(openStudio) ? `The student currently has the "${openStudio}" studio open.` : "",
    state && Object.keys(state).length ? `Live state: ${JSON.stringify(state).slice(0, 400)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await runOneShot({
    provider: prefs.provider,
    model: prefs.model,
    apiKey: prefs.apiKey,
    baseUrl: prefs.baseUrl,
    maxTokens: 400,
    system: context ? `${systemPrompt()}\n\nContext:\n${context}` : systemPrompt(),
    user: message,
  });
  if ("error" in res) return ok({ ok: false, error: "The guide couldn't answer right now — try again." });

  if (res.tokensUsed > 0) {
    void recordAiUsage({ userId: g.user.id, tokens: res.tokensUsed, kind: "lab_guide", provider: prefs.provider, model: prefs.model });
  }

  // Tolerant parse: the model returns minified JSON; fall back to raw text.
  let reply = res.text.trim();
  let open: string | undefined;
  try {
    const json = JSON.parse(reply.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as { reply?: string; openStudio?: string };
    if (typeof json.reply === "string") reply = json.reply;
    if (json.openStudio && isStudioId(json.openStudio)) open = json.openStudio;
  } catch {
    /* not JSON — use the raw text as the reply */
  }
  return ok({ ok: true, reply, openStudio: open });
}
