import "server-only";

/**
 * Template router — decides WHICH starter to scaffold for a from-scratch
 * prompt. Cheapest-first: a zero-token keyword/rules pass over the manifests;
 * only when that's not confident do we spend ONE tiny constrained model call.
 * Output is always one of our known template ids (never free-form design), so
 * the cost is a rounding error versus making the agent author all boilerplate.
 */

import { TEMPLATES, TEMPLATE_IDS } from "./registry.generated";
import { runOneShot, resolveAiPrefs } from "@/lib/ai-agent";
import { recordAiUsage } from "@/lib/ai-usage";

const DEFAULT_ID = "static-web";

export interface Classification {
  templateId: string;
  label: string;
  confident: boolean;
  alternatives: { id: string; label: string }[];
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 1);
}

/** Pure, zero-token scoring. Returns scores per template id (highest = best). */
export function scoreByKeywords(prompt: string): { id: string; score: number }[] {
  const words = new Set(tokenize(prompt));
  return TEMPLATE_IDS.map((id) => {
    const m = TEMPLATES[id].manifest;
    let score = 0;
    for (const kw of m.keywords) {
      // multi-word keywords match as substrings; single words match tokens.
      if (kw.includes(" ") || kw.includes("-")) {
        if (prompt.toLowerCase().includes(kw)) score += 2;
      } else if (words.has(kw)) {
        score += 1;
      }
    }
    return { id, score };
  }).sort((a, b) => b.score - a.score);
}

/** Confident when the top score clears a floor AND beats the runner-up. */
export function classifyByKeywords(prompt: string): { templateId: string; confident: boolean } {
  const ranked = scoreByKeywords(prompt);
  const top = ranked[0];
  const second = ranked[1];
  const confident = Boolean(top && top.score >= 2 && (!second || top.score - second.score >= 1));
  return { templateId: confident ? top.id : DEFAULT_ID, confident };
}

function alternativesFor(prompt: string, chosenId: string): { id: string; label: string }[] {
  const ranked = scoreByKeywords(prompt).filter((r) => r.id !== chosenId);
  return ranked.map((r) => ({ id: r.id, label: TEMPLATES[r.id].manifest.label }));
}

/**
 * Full classification: rules pass first; one constrained model call only when
 * the rules aren't confident. Always returns alternatives for the confirm UI.
 */
export async function classifyPrompt(prompt: string, userId: string): Promise<Classification> {
  const rules = classifyByKeywords(prompt);
  let chosen = rules.templateId;

  if (!rules.confident) {
    try {
      const prefs = await resolveAiPrefs(userId);
      const list = TEMPLATE_IDS.map((id) => `${id}: ${TEMPLATES[id].manifest.description}`).join("\n");
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
        if (TEMPLATE_IDS.includes(guess)) chosen = guess;
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
    label: TEMPLATES[chosen].manifest.label,
    confident: rules.confident,
    alternatives: alternativesFor(prompt, chosen),
  };
}

/** Build the Workspace.notes seed for an injected template (kept short). */
export function buildTemplateNote(templateId: string): string {
  const tpl = TEMPLATES[templateId];
  if (!tpl) return "";
  const keyFiles = tpl.files
    .filter((f) => /(^|\/)(package\.json|app\.py|index\.js|main\.tsx|index\.html|app\/page\.tsx|requirements\.txt)$/.test(f.path))
    .map((f) => f.path)
    .slice(0, 6);
  const keyLine = keyFiles.length ? `\nKey files: ${keyFiles.join(", ")}.` : "";
  return (tpl.manifest.notesBlurb + keyLine).slice(0, 2000);
}
