import "server-only";

/**
 * New-project intake curation engine — combines A (free rules) and B (a tiny,
 * surgical model call) at their best:
 *
 *   1. RULE PASS (free): reuse the template classifier for the stack, scan the
 *      idea for features, and score how clear the request is.
 *   2. GATE (free): a clear request skips B entirely and builds from a
 *      rules-made brief — zero tokens. Only a vague request invokes B.
 *   3. B (primed + constrained): one small call, handed the rule findings
 *      (chosen stack + detected features), asked for AT MOST 2 high-value
 *      scope questions — it never re-derives what rules already know.
 *   4. SYNTHESIZE (free): rules fold idea + classifier + features + the user's
 *      answers into a model-only brief. B is never trusted to run the show, and
 *      rules are always the fallback if B errors / there's no key.
 */

import { classifyPrompt } from "@/lib/templates/router";
import { resolveAiPrefs, runOneShot } from "@/lib/ai-agent";
import { recordAiUsage } from "@/lib/ai-usage";
import { matchArchetype, applyImplications } from "@/lib/intake-knowledge";

export interface IntakeQuestion {
  key: string;
  text: string;
  /** Quick-reply chips; when absent the client shows a free-text answer. */
  options?: string[];
}

export type IntakeResult =
  | { done: true; brief: string; stack: string }
  | { done: false; questions: IntakeQuestion[]; stack: string };

const FEATURE_RULES: [RegExp, string][] = [
  [/\b(auth|login|sign[\s-]?in|sign[\s-]?up|account|users?)\b/, "user authentication"],
  [/\b(database|db|persist|crud|records?|store data)\b/, "a database"],
  [/\b(payment|stripe|checkout|billing|subscription|paywall)\b/, "payments"],
  [/\b(dashboard|analytics|charts?|metrics|reports?)\b/, "a dashboard"],
  [/\b(realtime|real-time|live|websocket)\b/, "realtime updates"],
  [/\b(admin|cms|moderation)\b/, "an admin area"],
  [/\b(search|filter|sort)\b/, "search & filtering"],
  [/\b(upload|files?|images?|photos?|avatar)\b/, "file uploads"],
  [/\b(api|rest|graphql|endpoint)\b/, "an API"],
  [/\b(drag|drop|kanban|board)\b/, "drag-and-drop"],
];

/** Zero-token feature extraction from the idea text. */
export function extractFeatures(idea: string): string[] {
  const lower = idea.toLowerCase();
  const out: string[] = [];
  for (const [re, label] of FEATURE_RULES) if (re.test(lower) && !out.includes(label)) out.push(label);
  return out;
}

/** How specific is the request? 0 (vague) … 4 (detailed). */
export function clarityScore(idea: string, features: string[]): number {
  const words = idea.trim().split(/\s+/).filter(Boolean).length;
  let s = 0;
  if (words >= 8) s += 1;
  if (words >= 18) s += 1;
  if (features.length >= 1) s += 1;
  if (features.length >= 2) s += 1;
  return s;
}

/** A model-only brief assembled from the rule findings + the user's answers. */
export function synthesizeBrief(opts: {
  stack: string;
  features: string[];
  answers?: Record<string, string>;
}): string {
  const answers = opts.answers ?? {};
  const pickedStack = answers.stack && answers.stack !== "You decide" ? answers.stack : opts.stack;

  const parts: string[] = [];
  if (pickedStack) parts.push(`Preferred stack: ${pickedStack}. Build with it unless it's clearly unsuitable.`);

  const must = [...opts.features];
  for (const [k, v] of Object.entries(answers)) {
    if (k === "stack" || !v?.trim() || v.trim().toLowerCase() === "skip") continue;
    must.push(v.trim());
  }
  if (must.length) parts.push(`Make sure to include: ${Array.from(new Set(must)).join("; ")}.`);

  return parts.join(" ");
}

/** Build the deterministic stack question from the classifier's candidates. */
function stackQuestion(label: string, alternatives: { label: string }[]): IntakeQuestion {
  const options = Array.from(new Set([label, ...alternatives.map((a) => a.label)]))
    .filter(Boolean)
    .slice(0, 5);
  options.push("You decide");
  return { key: "stack", text: "Which stack should I use?", options };
}

/** B: one small, primed, constrained call for scope questions on a vague idea. */
async function aiScopeQuestions(opts: {
  idea: string;
  userId: string;
  stackLabel: string;
  features: string[];
}): Promise<IntakeQuestion[]> {
  try {
    const prefs = await resolveAiPrefs(opts.userId);
    if (!prefs.apiKey && prefs.provider !== "local") return []; // no key → rules only
    const res = await runOneShot({
      provider: prefs.provider,
      model: prefs.model,
      apiKey: prefs.apiKey,
      baseUrl: prefs.baseUrl,
      maxTokens: 220,
      system:
        "You refine a vague new-app request before an AI builds it. The stack is ALREADY chosen — do NOT ask about it. " +
        "Ask AT MOST 2 short, concrete, high-value questions to fill scope gaps (key entities, must-have features, " +
        "audience). Prefer questions with 2–4 quick-reply options. Return ONLY minified JSON: " +
        '{"questions":[{"key":"slug","text":"...","options":["..."]}]}. options is optional. No prose, no code fences.',
      user: `Idea: ${opts.idea}\nStack: ${opts.stackLabel}\nDetected features: ${opts.features.join(", ") || "none"}`,
    });
    if ("error" in res) return [];
    if (res.tokensUsed > 0) {
      void recordAiUsage({
        userId: opts.userId,
        tokens: res.tokensUsed,
        kind: "intake_curation",
        provider: prefs.provider,
        model: prefs.model,
      });
    }
    const json = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(json) as { questions?: IntakeQuestion[] };
    return (parsed.questions ?? [])
      .filter((q) => q && typeof q.text === "string" && typeof q.key === "string")
      .slice(0, 2)
      .map((q) => ({ key: q.key, text: q.text, options: Array.isArray(q.options) ? q.options.slice(0, 4) : undefined }));
  } catch {
    return []; // unparseable / no model → fall back to the rules question
  }
}

/**
 * The engine. Round 1: pass `idea`. Round 2: pass `idea` + `answers` to get the
 * final brief. Returns either questions to ask, or a ready-to-build brief.
 */
export async function curate(opts: {
  idea: string;
  userId: string;
  answers?: Record<string, string>;
}): Promise<IntakeResult> {
  const { idea, userId } = opts;
  const classification = await classifyPrompt(idea, userId); // rules + (maybe) tiny B for stack

  // KNOWLEDGE BASE: a matched archetype contributes a stack hint, default
  // features, and the best clarifying question — all free. Implications then
  // auto-complete the feature list (e.g. payments → auth + a database).
  const archetype = matchArchetype(idea);
  const ideaFeatures = extractFeatures(idea);
  const features = applyImplications(Array.from(new Set([...ideaFeatures, ...(archetype?.features ?? [])])));
  // Prefer the classifier's stack when it's confident; otherwise the archetype's.
  const stack = classification.confident ? classification.label : archetype?.stack ?? classification.label;

  // Round 2 → synthesize and finish.
  if (opts.answers) {
    return { done: true, stack, brief: synthesizeBrief({ stack, features, answers: opts.answers }) };
  }

  // Round 1 → gate.
  const questions: IntakeQuestion[] = [];
  // Only ask the stack when neither the classifier nor an archetype knows it.
  if (!classification.confident && !archetype)
    questions.push(stackQuestion(classification.label, classification.alternatives));

  // Vague idea → a clarifying question. Prefer the archetype's curated one
  // (free); only fall back to a tiny AI call when we have no archetype.
  if (clarityScore(idea, ideaFeatures) <= 1) {
    if (archetype?.question) questions.push(archetype.question);
    else {
      const scope = await aiScopeQuestions({ idea, userId, stackLabel: stack, features });
      if (scope.length) questions.push(...scope);
      else if (features.length === 0)
        questions.push({
          key: "scope",
          text: "Anything specific I should include?",
          options: ["User accounts", "A database", "A dashboard", "Keep it simple"],
        });
    }
  }

  // Clear + known → no questions, build straight away (zero extra tokens).
  if (questions.length === 0) return { done: true, stack, brief: synthesizeBrief({ stack, features }) };

  return { done: false, questions, stack };
}
