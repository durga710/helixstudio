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

// ── Intent routing (the smart split) ────────────────────────────────────────
// Keyword *scoring* alone sent most app requests to the static default (an "app"
// word scores 1, below the confidence floor of 2). So before scoring we read the
// prompt's INTENT: an explicit framework wins; a dynamic/app request gets a real
// framework; only a genuinely static site type (portfolio, landing…) stays static.

/** Explicit framework mention → that framework's starter (strongest signal). */
const FRAMEWORK_HINTS: { re: RegExp; id: string }[] = [
  { re: /\b(next\.?js|nextjs)\b/, id: "nextjs-app" },
  { re: /\breact\b/, id: "nextjs-app" },
  { re: /\bdjango\b/, id: "django-app" },
  { re: /\bflask\b/, id: "flask-api" },
  { re: /\b(express|node\.?js|nodejs)\b/, id: "express-api" },
];

/** Words that imply a dynamic, stateful application → a framework (nextjs-app). */
const APP_INTENT = [
  "app", "application", "web app", "webapp", "dashboard", "saas", "platform", "tool",
  "login", "signup", "sign up", "sign in", "auth", "account", "accounts", "user", "users",
  "admin", "crud", "database", "backend", "api", "portal", "tracker", "manager", "management",
  "booking", "reservation", "marketplace", "social", "chat", "messaging", "messenger",
  "todo", "to-do", "inventory", "cms", "ecommerce", "e-commerce", "commerce", "store", "shop",
  "checkout", "crm", "scheduler", "calendar", "forum", "wiki", "directory", "analytics",
];

/** Words that imply a simple, content-only site → the instant static starter. */
const STATIC_INTENT = [
  "portfolio", "landing", "landing page", "brochure", "one-page", "one page",
  "coming soon", "promo", "flyer", "resume", "cv", "business card",
  "personal site", "personal website",
];

function countIntent(lower: string, words: Set<string>, list: string[]): number {
  let n = 0;
  for (const kw of list) {
    if (kw.includes(" ") || kw.includes("-")) {
      if (lower.includes(kw)) n++;
    } else if (words.has(kw)) {
      n++;
    }
  }
  return n;
}

/** Resolve a starter from intent, or null to fall through to keyword scoring. */
function intentRoute(prompt: string, templates: Templates): string | null {
  const lower = prompt.toLowerCase();
  for (const h of FRAMEWORK_HINTS) {
    if (h.re.test(lower) && templates[h.id]) return h.id;
  }
  const words = new Set(tokenize(prompt));
  const appHits = countIntent(lower, words, APP_INTENT);
  const staticHits = countIntent(lower, words, STATIC_INTENT);
  // A clearly-static site type with no app signal stays static…
  if (staticHits > 0 && appHits === 0 && templates[DEFAULT_ID]) return DEFAULT_ID;
  // …otherwise any app signal earns a real framework.
  if (appHits > 0 && templates["nextjs-app"]) return "nextjs-app";
  return null;
}

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

  // Intent first: an explicit framework, an app request, or a clearly-static site
  // type resolves here with no model call (and fixes "every app became static").
  const intent = intentRoute(prompt, templates);
  if (intent) {
    return {
      templateId: intent,
      label: templates[intent]?.manifest.label ?? intent,
      confident: true,
      alternatives: alternativesFor(prompt, intent, templates),
    };
  }

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

/**
 * Pick the best GAME starter for a "My Own Idea" game prompt — keyword scoring
 * over only the game-engine templates (framework === "game"). Zero tokens: the
 * Game Agent already knows it's a game, so this just resolves 2D vs 3D vs engine
 * from the words. Falls back to game-2d (Phaser) when nothing scores.
 */
export async function classifyGameTemplate(prompt: string): Promise<string> {
  const all = await getAllTemplates();
  const games: Templates = {};
  for (const [id, t] of Object.entries(all)) {
    if (t.manifest.framework === "game") games[id] = t;
  }
  if (Object.keys(games).length === 0) return "game-2d";
  const ranked = scoreByKeywords(prompt, games);
  const top = ranked[0];
  return top && top.score > 0 ? top.id : (games["game-2d"] ? "game-2d" : Object.keys(games)[0]);
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
