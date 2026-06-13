import "server-only";

/**
 * Template router — decides WHICH starter to scaffold for a from-scratch
 * prompt. Cheapest-first: a zero-token keyword/rules pass over the manifests;
 * only when that's not confident do we spend ONE tiny constrained model call.
 * Output is always one of our known template ids (never free-form design).
 *
 * Reads templates through the DB-backed store (store.ts), so a refreshed
 * template is picked up without a redeploy.
 */

import { getAllTemplates } from "./store";
import type { Template } from "./types";
import { runOneShot, resolveAiPrefs } from "@/lib/ai-agent";
import { recordAiUsage } from "@/lib/ai-usage";
import { checkTokenBudget } from "@/lib/token-budget";

const DEFAULT_ID = "static-web";

export interface Classification {
  templateId: string;
  label: string;
  confident: boolean;
  alternatives: { id: string; label: string }[];
}

type Templates = Record<string, Template>;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 1);
}

/** Pure, zero-token scoring over the given templates (highest = best). */
function scoreByKeywords(prompt: string, templates: Templates): { id: string; score: number }[] {
  const lower = prompt.toLowerCase();
  const words = new Set(tokenize(prompt));
  return Object.values(templates)
    .map((t) => {
      let score = 0;
      for (const kw of t.manifest.keywords) {
        if (kw.includes(" ") || kw.includes("-")) {
          if (lower.includes(kw)) score += 2;
        } else if (words.has(kw)) {
          score += 1;
        }
      }
      return { id: t.manifest.id, score };
    })
    .sort((a, b) => b.score - a.score);
}

function defaultId(templates: Templates): string {
  return templates[DEFAULT_ID] ? DEFAULT_ID : (Object.keys(templates)[0] ?? DEFAULT_ID);
}

/** Confident when the top score clears a floor AND beats the runner-up. */
function classifyByKeywords(prompt: string, templates: Templates): { templateId: string; confident: boolean } {
  const ranked = scoreByKeywords(prompt, templates);
  const top = ranked[0];
  const second = ranked[1];
  const confident = Boolean(top && top.score >= 2 && (!second || top.score - second.score >= 1));
  return { templateId: confident ? top.id : defaultId(templates), confident };
}

function alternativesFor(prompt: string, chosenId: string, templates: Templates): { id: string; label: string }[] {
  return scoreByKeywords(prompt, templates)
    .filter((r) => r.id !== chosenId)
    .map((r) => ({ id: r.id, label: templates[r.id].manifest.label }));
}

/**
 * Full classification: rules pass first; one constrained model call only when
 * the rules aren't confident. Always returns alternatives.
 */
export async function classifyPrompt(prompt: string, userId: string): Promise<Classification> {
  const templates = await getAllTemplates();
  const ids = Object.keys(templates);
  const rules = classifyByKeywords(prompt, templates);
  let chosen = rules.templateId;

  // Only spend on the model when the rules aren't confident AND the user is
  // within budget — the budget gate otherwise lives only in runAgentTurn, so a
  // suspended/over-quota user with their own key could spend here. Rules win otherwise.
  if (!rules.confident && (await checkTokenBudget(userId)).ok) {
    try {
      const prefs = await resolveAiPrefs(userId);
      const list = ids.map((id) => `${id}: ${templates[id].manifest.description}`).join("\n");
      const res = await runOneShot({
        provider: prefs.provider,
        model: prefs.model,
        apiKey: prefs.apiKey,
        baseUrl: prefs.baseUrl,
        maxTokens: 16,
        system:
          "You pick the single best starter template for a new project. " +
          "Reply with ONLY the template id — no punctuation, no explanation. Choices:\n" +
          list,
        user: prompt,
      });
      if (!("error" in res)) {
        const guess = res.text.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (ids.includes(guess)) chosen = guess;
        if (res.tokensUsed > 0) {
          void recordAiUsage({
            userId,
            tokens: res.tokensUsed,
            kind: "template_classify",
            provider: prefs.provider,
            model: prefs.model,
          });
        }
      }
    } catch {
      // model unavailable / no key — keep the rules-pass default.
    }
  }

  return {
    templateId: chosen,
    label: templates[chosen]?.manifest.label ?? chosen,
    confident: rules.confident,
    alternatives: alternativesFor(prompt, chosen, templates),
  };
}

/** Build the Workspace.notes seed for an injected template (kept short). */
export function buildTemplateNote(tpl: Template): string {
  const keyFiles = tpl.files
    .filter((f) =>
      /(^|\/)(package\.json|app\.py|wsgi\.py|manage\.py|src\/server\.js|main\.tsx|index\.html|app\/page\.tsx|requirements\.txt)$/.test(
        f.path,
      ),
    )
    .map((f) => f.path)
    .slice(0, 6);
  const keyLine = keyFiles.length ? `\nKey files: ${keyFiles.join(", ")}.` : "";
  return (tpl.manifest.notesBlurb + keyLine).slice(0, 2000);
}
