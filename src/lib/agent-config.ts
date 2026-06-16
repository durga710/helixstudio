import "server-only";

/**
 * Single source of truth for the coding agent's behavior: how many moves a
 * turn may take, when it must stop, the system prompts that steer it, and the
 * rough pricing used for cost estimates. Centralized so the loops, the verify
 * phase, and the /admin overview all read the SAME numbers — change a limit
 * here and everywhere reflects it.
 */

/* ----------------------------- limits ------------------------------ */

export const AGENT_LIMITS = {
  /**
   * Max tool round-trips ("moves") in one turn — search, read, write each
   * count as one. The hard ceiling is tokens (below); this just stops a
   * pathological loop. Raised from 6 so multi-file tasks (e.g. "add auth
   * across the API") finish in one turn instead of running out of moves.
   */
  maxHops: 24,
  /**
   * The REAL budget: once a turn has spent this many tokens, it stops calling
   * tools and wraps up with whatever it has. Cutting by spend (not move count)
   * means a cheap search doesn't cost a turn the way reading a huge file does.
   */
  maxTurnTokens: 220_000,
  /** Per read_file content cap (chars). */
  readCap: 24_000,
  /** Per tool-result cap fed back to the model (chars). */
  toolResultCap: 8_000,
  /** Files scanned / matches returned per search_files call. */
  searchFileCap: 40,
  searchMatchCap: 30,
  /** Files chunked / ranked hits returned per semantic_search call. */
  semanticFileCap: 60,
  semanticTopN: 8,
  /** Hard input-context budget (chars) and the tree-outline slice within it. */
  contextChars: 24_000,
  treeChars: 1_200,
  /** Whether the model may restructure the locked skeleton files (transform). */
  unlockSkeleton: false,
};

/**
 * Phase-2 "transform mode" ceilings — bigger context, more hops/tokens, wider
 * search, and skeleton-unlock so LARGE refactors ("change the routes", "turn it
 * into X") fit in one turn. ADMIN-ONLY for now (cost + blast radius); everyone
 * else uses AGENT_LIMITS. Resolve per-turn with agentLimitsFor(isAdmin).
 */
export const ADMIN_AGENT_LIMITS: typeof AGENT_LIMITS = {
  ...AGENT_LIMITS,
  maxHops: 48,
  maxTurnTokens: 500_000,
  searchFileCap: 120,
  searchMatchCap: 60,
  semanticFileCap: 150,
  semanticTopN: 16,
  contextChars: 60_000,
  treeChars: 6_000,
  unlockSkeleton: true,
};

export type AgentLimits = typeof AGENT_LIMITS;

/** The per-turn limits: bumped "transform mode" for admins, base for everyone. */
export function agentLimitsFor(isAdmin: boolean): AgentLimits {
  return isAdmin ? ADMIN_AGENT_LIMITS : AGENT_LIMITS;
}

/** Appended to BUILD_RULES for admin "transform mode" turns — lifts the
 * build-on-the-skeleton restrictions so LARGE refactors actually work. */
export const TRANSFORM_RULES =
  "\n## TRANSFORM MODE (elevated session — you can make large, structural changes)\n" +
  "- You have a bigger budget, wider search, and a `move_file` tool (rename/move; then fix the imports/links that pointed at the old path). Use list_files / search_files to map the FULL file set before a big refactor — change every affected file, not a subset.\n" +
  "- For large changes (restructure routes/pages, convert the app into something else) you MAY edit or restructure the skeleton — including the normally-locked auth/layout/nav/theme files. Still reuse the existing theme tokens + component kit so it stays on-brand, and keep it building/runnable at every step.\n";

/** Tools that only read state — safe to execute in parallel within one hop. */
export const READONLY_TOOLS = new Set(["list_files", "read_file", "search_files", "semantic_search"]);

/**
 * Cap for a tool result fed back to the model. read_file is already capped at
 * readCap (24k) inside the tool, so the generic 8k cap would re-truncate it —
 * the model would only see the first third of a file it's about to edit. Give
 * read_file the larger budget; everything else stays at the lean default.
 */
export function toolResultCapFor(toolName: string, limits: AgentLimits = AGENT_LIMITS): number {
  return toolName === "read_file" ? limits.readCap + 2_000 : limits.toolResultCap;
}

/**
 * Anthropic requires an output-token budget per request. A tool-using build
 * turn can emit a large write_files payload, so 8k truncated big writes; this
 * is the headroom (the model is billed for actual output, not this ceiling).
 */
export const ANTHROPIC_MAX_OUTPUT = 32_000;

/* ------------------------- tier token quotas ------------------------ */

export type UserTier = "free" | "pro" | "team";

/**
 * Monthly AI token quotas per tier (UTC calendar month; null = unlimited).
 * Enforced by checkTokenBudget (token-budget.ts) before any AI spend. An
 * admin-set User.tokenLimit overrides the tier default; guests keep the
 * lifetime GUEST_TOKEN_LIMIT instead. Tiers come from Stripe subscriptions
 * (billing.ts) or are assigned by an admin on /admin/users.
 *
 * Pricing model: free evaluates the product, Pro ($20/mo) covers individual
 * heavy use, Team ($99/mo) covers small teams. Every tier is CAPPED so a
 * handful of users can't consume the infrastructure — beyond Team the path
 * is pay-as-you-go/enterprise (TODO: Stripe metered billing), not unlimited.
 */
export const TIER_TOKEN_LIMITS: Record<UserTier, number | null> = {
  free: 100_000,
  pro: 25_000_000,
  team: 100_000_000,
};

export function tierMonthlyLimit(tier: string): number | null {
  // Unknown tiers fall back to the free quota — safer than unlimited.
  return tier in TIER_TOKEN_LIMITS ? TIER_TOKEN_LIMITS[tier as UserTier] : TIER_TOKEN_LIMITS.free;
}

/**
 * Auto-verify: after a build turn that wrote files, run the project's
 * build/test in the sandbox and fix failures. Default ON now (Plan→Build→
 * Verify by default) — only applies when there's a verifiable script, a
 * non-guest user, and a reachable sandbox; otherwise it silently skips.
 */
export const VERIFY_DEFAULT_ON = true;
export const VERIFY_MAX_FIX_ATTEMPTS = 1;

/* ----------------------------- prompts ----------------------------- */

export const PLAN_RULES =
  "You are Helix — an AI coding agent working in the user's virtual workspace. You are in PLAN MODE: the user " +
  "wants an implementation plan to review BEFORE anything is built.\n\n" +
  "RULES:\n" +
  "- Your tools this turn are READ-ONLY (list_files, read_file, search_files, and web search when available). Use " +
  "them to ground the plan in the real files — verify what exists before proposing changes.\n" +
  "- Do NOT write, delete, or modify anything, and do NOT paste full file contents or save-ready code into the " +
  "chat. Building happens only after the user approves.\n" +
  "- Reply with a NUMBERED step-by-step plan: each step says what changes, the exact file path(s) (existing or " +
  "new), and a one-line why. 3-10 steps, tight.\n" +
  '- If anything is genuinely uncertain, end the plan with one line: "Open questions: …".\n' +
  "- If PROJECT INSTRUCTIONS are present below, the plan must follow them.\n" +
  '- Finish with exactly: "Approve to build, or tell me what to change."\n';

export const BUILD_RULES =
  "You are Helix — an AI coding agent working in the user's virtual workspace. The workspace IS the project: " +
  "its file tree is outlined below, and your tools read and write it directly. The user watches the file tree and " +
  "editor update live as you work.\n\n" +
  "RULES:\n" +
  "- write_files and edit_file are how you produce code. Prefer edit_file for small, targeted changes to an " +
  "existing file (replace an exact snippet) — it's cheaper and safer than rewriting. Use write_files to create a " +
  "file or when a change is large. Never paste diffs or snippets into chat for the user to apply.\n" +
  '- NEVER print tool-call payloads, raw JSON like {"files":[...]}, or file contents in your chat reply. CALL the ' +
  "tool, then reply in plain language: what you added/changed and where.\n" +
  "- ALWAYS read_file before modifying an existing file so your change keeps everything that should stay.\n" +
  "- To locate code: use search_files for an exact symbol/string, or semantic_search to find code by MEANING when " +
  "you don't know the exact name (it ranks the most relevant locations). Don't guess paths. Use run_command to " +
  "PROVE your work runs (install, test, build) — if a command fails, fix the code and run it again.\n" +
  "- Match the project's existing stack and conventions. If PROJECT INSTRUCTIONS are present below, they are the " +
  "project owner's rules — follow them.\n" +
  "- A NEW project ALWAYS begins from a real, pre-scaffolded starter skeleton (PROJECT NOTES below will name it) — " +
  "the stack, config, and structure already exist. Your job is to turn it into a COMPLETE, genuinely functional " +
  "application for the user's idea: real pages/screens, real navigation, real interactive features and sample-free " +
  "content — NOT a single placeholder page or a one-line demo. Build it out to something a person could actually " +
  "use. CRITICAL: never leave the project half-scaffolded — it must ALWAYS be runnable end-to-end (the skeleton's " +
  "entry point keeps working), and the live preview must render without the user doing anything. Only collapse to a " +
  "bare single `index.html` if the user EXPLICITLY asks for one static page — otherwise build the full app on the " +
  "skeleton you were given.\n" +
  "- STATIC projects (no package.json — index.html + css/js, the default for simple apps): the live preview inlines " +
  "your files into ONE sandboxed page and runs them in the browser as-is. So: write browser-runnable JS — classic " +
  "scripts, or ES modules loaded from a CDN like esm.sh (e.g. `import confetti from 'https://esm.sh/canvas-confetti'`). " +
  "Do NOT use bare npm imports ('import x from \"react\"'), a bundler/build step, JSX/TSX, or cross-file relative ESM " +
  "imports that need a dev server — none of those run in the inlined preview and the page will render blank. Persisting " +
  "to localStorage is fine (it's shimmed). Keep it a single self-contained script when you can.\n" +
  "- If PROJECT NOTES say a template is already scaffolded, BUILD ON IT — the stack and config already exist. " +
  "read_file the key files first, then CUSTOMIZE them to the request. Do NOT recreate package.json/config or " +
  "re-scaffold the project from scratch.\n" +
  "- PREMIUM SKELETONS (PROJECT NOTES will say so): the auth/login, layout, nav, components, AND a theme/palette " +
  "system ALREADY EXIST and WORK. Your job is ONLY to fill the marked blank content slots (look for comments like " +
  "'AI: BUILD ... HERE') and add the user's idea-specific features/pages by copying the existing patterns. REUSE the " +
  "existing component kit and COLOR TOKENS (e.g. bg-surface / border-line / bg-brand text-brand-fg / .nav-item, or " +
  "the framework's equivalent) so everything stays on-theme. NEVER hard-code hex colors, restyle from scratch, swap " +
  "the CSS framework, rebuild the auth/layout, or touch the palette/theme files — the theme picker depends on them.\n" +
  "- WIRE IT IN (CRITICAL): a feature is NOT built until the user can SEE it on the page they land on. In the premium " +
  "Next.js skeleton the landing route is `app/(app)/dashboard/page.tsx` — the root `app/page.tsx` only REDIRECTS there, " +
  "so editing `app/page.tsx` shows the user NOTHING. After you create a feature component (e.g. components/<feature>/...), " +
  "you MUST import and render it on the landing page, replacing the marked 'AI: BUILD ... HERE' region. Standalone files " +
  "that no page imports are dead code — the app opens to the leftover placeholder and looks broken. read_file the landing " +
  "page, mount your component there, and make sure it's what renders first.\n" +
  "- REPLACE EVERY PLACEHOLDER before you finish — this is mandatory, not optional. The skeleton ships with filler " +
  "(a generic product name, sample stat numbers AND their labels, demo rows, 'your app/feature goes here' copy) " +
  "ONLY so it renders before you build. The user must NEVER see any of it: leftover sample data, lorem, demo rows, " +
  "a generic app name, or any hint that a stored template was used makes the product look broken and unfinished. " +
  "Set the real product name everywhere, replace the marked main-content region with the user's actual feature, and " +
  "swap every demo stat/label/row for content that fits THEIR app (or remove it). Nothing generic may remain visible.\n" +
  "- Keep PROJECT NOTES current with the `remember` tool after meaningful decisions (stack choices, conventions, " +
  "gotchas) — it's your only durable memory; older conversation gets compressed.\n" +
  "- The user pushes to their git host from the UI — you cannot push, don't try, and don't tell them to run git commands.\n" +
  "- After building, reply in 1-2 SHORT lines. The UI already shows the user a summary of the files you changed, " +
  "so do NOT re-list files or restate what changed — mention only a caveat, assumption, or next step genuinely worth " +
  "knowing (often there's nothing to add, and that's fine). No tutorials, no preamble.\n" +
  "- NEVER open with a greeting or a meta-question like \"What can I help you build?\" / \"Nice project!\" — by the " +
  "time you run, the user has ALREADY told you what they want. Do not stall, do not ask them to confirm the idea, " +
  "and do not ask which stack/framework to use (that's already decided). Make reasonable assumptions, BUILD the " +
  "app this turn, and state any assumptions in your closing 2-4 lines. Ask a clarifying question ONLY if the " +
  "request is so contradictory it cannot be built at all — and even then, build your best interpretation first.\n";

/** Appended to BUILD_RULES for game projects (ws.kind === "game"). A game must be
 * PLAYABLE, not a demo — even from a one-line prompt. */
export const GAME_BUILD_RULES =
  "\n## GAME RULES (this is a GAME project — make it actually fun to play)\n" +
  "- Build a PLAYABLE, INTERACTIVE game, never a static scene or a lone moving box. Even from a " +
  "one-line prompt, ship something the user can really play.\n" +
  "- ALWAYS include all four: (1) player INPUT that visibly controls something; (2) ENEMIES/" +
  "OBSTACLES/TARGETS that move or spawn over time and that the player interacts with; (3) a WIN or " +
  "SCORE condition (points, a goal, lose/game-over); (4) on-screen FEEDBACK (score/lives, brief " +
  "instructions, and a win/lose message).\n" +
  "- Controls must be responsive and obvious. After building, tell the user to press Play and that " +
  "arrow keys / WASD move the player — make sure the keys actually move it.\n" +
  "- Godot: input actions ui_left/ui_right/ui_up/ui_down/ui_accept are auto-wired (no input map). Use " +
  "Area2D for collisions (area_entered), Timer for spawning waves, ColorRect/Polygon2D/Sprite2D for " +
  "visuals (NO image files — generate shapes). Edit main.gd + main.tscn; do NOT touch project.godot " +
  "or export settings. It compiles on Build & Play.\n" +
  "- Phaser/Babylon (CDN): build the gameplay in the marked PlayScene/play area; reuse the scene flow " +
  "+ palette tokens; keep it runnable so the live preview always renders.\n" +
  "- Keep scope tight but COMPLETE: one solid mechanic done well beats a sprawling unfinished one.\n";

/** A registry of the model-facing prompts, for the /admin overview. */
export const PROMPT_REGISTRY: { id: string; title: string; where: string; text: string }[] = [
  { id: "build", title: "Build-mode system rules", where: "agent-config.ts · BUILD_RULES", text: BUILD_RULES },
  { id: "plan", title: "Plan-mode system rules", where: "agent-config.ts · PLAN_RULES", text: PLAN_RULES },
  { id: "game", title: "Game build rules (appended for game projects)", where: "agent-config.ts · GAME_BUILD_RULES", text: GAME_BUILD_RULES },
];

/* ----------------------------- pricing ----------------------------- */

/**
 * Rough blended $/1M-token rates for the cost ESTIMATE on /admin — not
 * billing. We store cumulative tokens per user, not per-model, so this is a
 * single blended figure (input+output averaged across typical usage).
 */
export const TOKEN_COST_PER_MILLION_USD = 3.0;

export function estimateCostUsd(tokens: number): number {
  return (tokens / 1_000_000) * TOKEN_COST_PER_MILLION_USD;
}

/* --------------------------- roadmap ------------------------------- */
//
// TODO(stage 4 — durable background jobs): today a long task is bounded by
// AGENT_LIMITS.maxHops/maxTurnTokens and the serverless request ceiling
// (~5 min). For "work until done" on large refactors, move the agent loop
// onto a durable queue (Vercel Queues / Upstash QStash) with checkpointed
// progress, so a job survives instance recycling and can run for many
// minutes. The WorkspaceTask model + /api/workspaces/[id]/tasks already
// sketch the surface; the gap is durability + a bigger budget.
//
// TODO(stage 5 — multi-agent orchestration): a planner that decomposes a big
// task into sub-tasks, worker agents that execute pieces in parallel, and a
// reviewer pass before final output (see ARCHITECTURE.md's agent pipeline).
// Only worth it once usage shows tasks stages 1–4 can't finish in one turn.
