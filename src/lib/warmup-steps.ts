/**
 * Warm-up steps for the editor chat: a short, paced checklist that fills the
 * gap between "send" and the agent's first REAL activity event, then gets out
 * of the way. Unlike the build studio (which derives steps from real scaffold
 * files), the editor doesn't yet know what a turn will do — so we classify the
 * user's message into an intent and show *process-true* steps for that intent.
 *
 * Honesty rule: every line describes something the agent genuinely does on the
 * way to answering (read context, scan files, plan) — never a fabricated
 * action. A question never shows "scaffolding"; a build never shows nothing.
 */

export type TurnKind = "ask" | "build" | "scaffold" | "edit";

/** Lightweight intent guess from the message text. */
export function classifyTurn(message: string): TurnKind {
  const m = message.trim().toLowerCase();
  const question =
    /\?\s*$/.test(m) ||
    /^(what|why|how|when|where|who|which|whose|can|could|would|should|does|do|did|is|are|was|were|will|explain|describe|tell me|summari[sz]e|walk me|help me understand|list|show me)\b/.test(
      m,
    );
  const scaffold = /\b(new app|new project|from scratch|build me|create (a|an|my|the)|scaffold|set up a|start a|spin up)\b/.test(m);
  const build = /\b(build|create|make|generate|add|implement|set ?up|write|design|wire|integrate|refactor|rebuild|hook up)\b/.test(m);

  if (scaffold) return "scaffold";
  if (question && !build) return "ask";
  if (build) return "build";
  return "edit";
}

// Each pool starts with a natural opener; the rest get shuffled in. All lines
// are true regardless of the eventual answer.
const POOLS: Record<TurnKind, string[]> = {
  ask: [
    "Reading your question",
    "Scanning the file tree",
    "Pulling up the relevant files",
    "Tracing the logic",
    "Cross-checking the details",
    "Gathering context",
  ],
  build: [
    "Reviewing the workspace",
    "Mapping out the approach",
    "Lining up the files to change",
    "Checking the existing stack",
    "Gathering context",
  ],
  scaffold: [
    "Choosing the right stack",
    "Sketching the project structure",
    "Preparing the foundation",
    "Lining up the starter files",
    "Planning the build",
  ],
  edit: [
    "Reading the workspace",
    "Finding the right files",
    "Reviewing the current code",
    "Working out the change",
    "Gathering context",
  ],
};

/**
 * A dynamic warm-up sequence for a turn: a natural opener plus 1–3 randomly
 * chosen, randomly ordered follow-ups from the intent's pool — so consecutive
 * turns rarely look the same.
 */
export function warmupSteps(message: string): string[] {
  const [opener, ...rest] = POOLS[classifyTurn(message)];
  // Fisher–Yates shuffle of the follow-ups (client-only; Math.random is fine).
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const extra = 1 + Math.floor(Math.random() * 3); // 1–3 follow-ups
  return [opener, ...rest.slice(0, extra)];
}
