import "server-only";

/**
 * Scope engine — the piece that lets the editor accept an AMBITIOUS prompt (a
 * whole-app brief, modules and all) and actually build it well, instead of
 * trying to one-shot the entire thing in a single capped turn and stalling.
 *
 *   1. estimateScope (free)   — how big is this request? simple | standard |
 *                               ambitious, from length + feature + structure
 *                               signals. Only "ambitious" takes the milestone
 *                               path; everything else keeps the lean single turn.
 *   2. surveyExisting (free)  — what does the workspace ALREADY have that
 *                               overlaps this idea? Fed to the planner so it
 *                               EXTENDS instead of duplicating (the user's
 *                               "review the codebase first, no dup" rule).
 *   3. planMilestones (1 call)— decompose an ambitious idea into 3-8 ordered,
 *                               independently-buildable milestones. Falls back
 *                               to a deterministic split if there's no AI key.
 *
 * The client runs the milestones as a sequence of normal build turns (each one
 * bounded, persisted, and verified), so a big build becomes several achievable
 * turns instead of one impossible one.
 */

import type { Workspace } from "@/generated/prisma/client";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles } from "@/lib/workspace";
import { resolveAiPrefs, runOneShot } from "@/lib/ai-agent";
import { recordAiUsage } from "@/lib/ai-usage";
import { checkTokenBudget } from "@/lib/token-budget";
import { extractFeatures } from "@/lib/intake";

export type ScopeSize = "simple" | "standard" | "ambitious";

export interface ScopeEstimate {
  size: ScopeSize;
  features: string[];
  signals: { chars: number; words: number; features: number; sections: number };
}

/** Markdown headers / "Module N" / numbered or bulleted top-level sections — a
 * proxy for "this brief describes several distinct things to build". */
function countSections(idea: string): number {
  const lines = idea.split(/\r?\n/);
  let n = 0;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^#{1,6}\s+\S/.test(l)) n++; // markdown heading
    else if (/^(module|phase|step|feature|screen|page|section)\b/i.test(l)) n++;
    else if (/^\d+[.)]\s+\S/.test(l)) n++; // numbered list item
  }
  return n;
}

/**
 * Classify the request size — free, deterministic. "ambitious" is the only tier
 * that triggers milestone decomposition, so the bar is deliberately high: a
 * normal "build me a todo app" stays a single lean turn (unchanged behavior).
 */
export function estimateScope(idea: string): ScopeEstimate {
  const text = idea.trim();
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const features = extractFeatures(text);
  const sections = countSections(text);
  const multiSignal =
    /\bmodules?\b|\bphases?\b|\bpipeline\b|\bmulti[\s-]?(module|agent|step|page)\b|\bend[\s-]?to[\s-]?end\b/i.test(
      text,
    );

  let size: ScopeSize = "simple";
  // Ambitious: a genuinely large or multi-part brief. Any ONE strong signal.
  if (chars >= 1200 || features.length >= 4 || sections >= 4 || (multiSignal && (chars >= 600 || sections >= 2))) {
    size = "ambitious";
  } else if (chars >= 350 || features.length >= 2 || sections >= 2) {
    size = "standard";
  }

  return { size, features, signals: { chars, words, features: features.length, sections } };
}

export interface Milestone {
  title: string;
  detail: string;
}

export interface ExistingSurvey {
  /** Workspace file paths that look related to the idea (extend, don't dup). */
  matched: string[];
  /** A one-line note surfaced to the user when overlap is found. */
  note?: string;
}

const STOPWORDS = new Set([
  "the","and","for","with","that","this","your","you","app","application","build","make","create",
  "should","would","could","there","their","them","they","from","into","onto","when","what","which",
  "while","about","also","like","etc","using","use","user","users","page","pages","feature","features",
  "module","modules","system","data","each","every","need","needs","want","wants","whatever","doing",
]);

/** Distinct meaningful nouns/terms in the idea (lowercased, length ≥ 4). */
function keyTerms(idea: string): string[] {
  const seen = new Set<string>();
  for (const m of idea.toLowerCase().matchAll(/[a-z][a-z0-9]{3,}/g)) {
    const w = m[0];
    if (!STOPWORDS.has(w)) seen.add(w);
    if (seen.size >= 40) break;
  }
  return [...seen];
}

/**
 * What does the workspace already contain that overlaps this idea? A new
 * (empty) scratch project returns nothing; an imported or already-built project
 * returns the files whose path mentions one of the idea's key terms, so the
 * planner is told to EXTEND them rather than recreate duplicate code.
 */
export async function surveyExisting(ws: Workspace, idea: string, userId: string): Promise<ExistingSurvey> {
  let paths: string[] = [];
  try {
    const auth = await getGitAuth(userId, ws.provider);
    const files = await withGitAuth(auth, () => listWorkspaceFiles(ws));
    paths = files.map((f) => f.path);
  } catch {
    return { matched: [] };
  }
  if (paths.length === 0) return { matched: [] };

  const terms = keyTerms(idea);
  if (terms.length === 0) return { matched: [] };
  const matched: string[] = [];
  for (const p of paths) {
    const lower = p.toLowerCase();
    if (terms.some((t) => lower.includes(t))) matched.push(p);
    if (matched.length >= 20) break;
  }
  if (matched.length === 0) return { matched: [] };
  return {
    matched,
    note: `Found ${matched.length} existing file${matched.length === 1 ? "" : "s"} that look related — I'll extend those instead of duplicating them.`,
  };
}

/* ----------------------------- milestones --------------------------- */

const MAX_MILESTONES = 8;
const MIN_MILESTONES = 3;

/** Deterministic fallback split when there's no AI key / the call fails. Built
 * from the detected features so it's still tailored, not a fixed list. */
function fallbackMilestones(idea: string, features: string[]): Milestone[] {
  const out: Milestone[] = [
    {
      title: "Foundation & layout",
      detail:
        "Scaffold the core structure, shared layout, navigation, and theme so every later piece has a home to slot into.",
    },
  ];
  for (const f of features.slice(0, MAX_MILESTONES - 2)) {
    out.push({ title: `Add ${f}`, detail: `Implement ${f} and wire it into the layout and any related screens.` });
  }
  if (out.length < MIN_MILESTONES) {
    out.push({
      title: "Core feature",
      detail: `Build the main thing the request is about: ${idea.slice(0, 160)}`,
    });
  }
  out.push({
    title: "Polish & connect",
    detail: "Wire the pieces together end-to-end, add empty/loading/error states, and make sure it builds and runs.",
  });
  return out.slice(0, MAX_MILESTONES);
}

function parseMilestones(text: string): Milestone[] {
  const json = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(json) as { milestones?: { title?: unknown; detail?: unknown }[] };
  return (parsed.milestones ?? [])
    .filter((m) => m && typeof m.title === "string" && typeof m.detail === "string")
    .map((m) => ({ title: String(m.title).slice(0, 80), detail: String(m.detail).slice(0, 400) }))
    .slice(0, MAX_MILESTONES);
}

/**
 * Decompose an ambitious idea into ordered milestones. One small model call,
 * grounded in the detected features + any existing overlap (so it extends, not
 * duplicates). Falls back to a deterministic split if the model is unavailable.
 */
export async function planMilestones(opts: {
  idea: string;
  userId: string;
  features: string[];
  existing: string[];
}): Promise<{ milestones: Milestone[]; tokensUsed: number }> {
  const fallback = fallbackMilestones(opts.idea, opts.features);
  try {
    if (!(await checkTokenBudget(opts.userId)).ok) return { milestones: fallback, tokensUsed: 0 };
    const prefs = await resolveAiPrefs(opts.userId);
    if (!prefs.apiKey && prefs.provider !== "local") return { milestones: fallback, tokensUsed: 0 };

    const existingNote = opts.existing.length
      ? `\n\nEXISTING FILES that may already cover parts of this (EXTEND these, do NOT recreate them):\n${opts.existing.slice(0, 20).join("\n")}`
      : "";

    const res = await runOneShot({
      provider: prefs.provider,
      model: prefs.model,
      apiKey: prefs.apiKey,
      baseUrl: prefs.baseUrl,
      extraHeaders: prefs.extraHeaders,
      maxTokens: 900,
      system:
        "You are the Planner. Decompose a build request into 3-8 ORDERED milestones, each independently " +
        "buildable and verifiable in one focused pass, ordered so each builds on the previous (foundation first, " +
        "polish last). Every milestone: a short title (<=8 words) and one or two sentences of detail naming the " +
        "concrete files/pieces to build. Reuse and EXTEND any existing files mentioned — never duplicate them. " +
        'Return ONLY minified JSON: {"milestones":[{"title":"...","detail":"..."}]}. No prose, no code fences.',
      user: `REQUEST:\n${opts.idea.slice(0, 12_000)}\n\nDETECTED FEATURES: ${opts.features.join(", ") || "none"}${existingNote}`,
    });
    if ("error" in res) return { milestones: fallback, tokensUsed: 0 };
    if (res.tokensUsed > 0) {
      void recordAiUsage({
        userId: opts.userId,
        tokens: res.tokensUsed,
        kind: "intake_curation",
        provider: prefs.provider,
        model: prefs.model,
      });
    }
    const milestones = parseMilestones(res.text);
    return { milestones: milestones.length >= MIN_MILESTONES ? milestones : fallback, tokensUsed: res.tokensUsed };
  } catch {
    return { milestones: fallback, tokensUsed: 0 };
  }
}
