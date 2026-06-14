import "server-only";

/**
 * AI library "scout" — admin-only, low-token, SUGGESTIONS ONLY. One constrained
 * model call asks for modern libraries worth ADDING to each premium template, and
 * writes them to Template.libraryState.suggestions for a human to review. It NEVER
 * edits a template (that stays deterministic, in the freshness job). Reuses the
 * same one-shot plumbing as the prompt classifier.
 */

import { runOneShot, resolveAiPrefs } from "@/lib/ai-agent";
import { recordAiUsage } from "@/lib/ai-usage";
import { db } from "@/lib/db";
import { getAllTemplates, invalidateTemplatesCache } from "./store";

export interface ScoutSuggestion {
  lib: string;
  why: string;
}

/** The premium templates the scout reasons about + their current stack (so it
 * doesn't re-suggest what's already there). */
const FRAMEWORK_TEMPLATES: Record<string, string> = {
  "nextjs-premium": "Next.js App Router, React 19, Tailwind v4, shadcn/Radix, framer-motion, react-hook-form+zod, TanStack Table, lucide, sonner",
  "express-premium": "Express, EJS, HTMX, Alpine.js, Tailwind (CDN), helmet/cors",
  "flask-premium": "Flask app-factory, Jinja, HTMX, Alpine.js, Tailwind (CDN)",
  "django-premium": "Django, django-htmx, HTMX, Alpine.js, Tailwind (CDN)",
  "static-premium": "Vanilla HTML, Tailwind (CDN), Alpine.js, AOS, Chart.js, lucide",
};

export async function runLibraryScout(userId: string): Promise<Record<string, ScoutSuggestion[]>> {
  const prefs = await resolveAiPrefs(userId);
  const list = Object.entries(FRAMEWORK_TEMPLATES)
    .map(([id, stack]) => `${id} — has: ${stack}`)
    .join("\n");

  const res = await runOneShot({
    provider: prefs.provider,
    model: prefs.model,
    apiKey: prefs.apiKey,
    baseUrl: prefs.baseUrl,
    maxTokens: 500,
    system:
      "You suggest modern, popular, well-maintained libraries to ADD to premium starter " +
      "templates to improve UI/UX and developer experience. For each template id, suggest 1-3 " +
      "libraries that are NOT already in its stack and fit its framework. Reply with ONLY compact " +
      'JSON, no prose, no code fences: {"<template-id>":[{"lib":"name","why":"<=8 words"}]}.',
    user: "Templates:\n" + list,
  });
  if ("error" in res) throw new Error(res.error);
  if (res.tokensUsed > 0) {
    void recordAiUsage({ userId, tokens: res.tokensUsed, kind: "library_scout", provider: prefs.provider, model: prefs.model });
  }

  const text = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: Record<string, ScoutSuggestion[]>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Scout returned unparseable JSON.");
  }

  const templates = await getAllTemplates();
  const out: Record<string, ScoutSuggestion[]> = {};
  for (const [id, sugg] of Object.entries(parsed)) {
    if (!templates[id] || !Array.isArray(sugg)) continue;
    const clean = sugg
      .filter((s): s is ScoutSuggestion => Boolean(s) && typeof s.lib === "string")
      .slice(0, 3)
      .map((s) => ({ lib: String(s.lib).slice(0, 40), why: String(s.why ?? "").slice(0, 80) }));
    if (clean.length === 0) continue;
    out[id] = clean;
    const row = await db().template.findUnique({ where: { templateId: id }, select: { libraryState: true } }).catch(() => null);
    const state = (row?.libraryState as Record<string, unknown> | null) ?? {};
    await db()
      .template.update({
        where: { templateId: id },
        data: { libraryState: { ...state, suggestions: clean, suggestedAt: new Date().toISOString() } as unknown as object },
      })
      .catch(() => {});
  }
  invalidateTemplatesCache();
  return out;
}
