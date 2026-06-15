/**
 * ScenarioRegistry — the data that drives the live hero demo.
 *
 * The demo is pure presentation: nothing here calls an API. A scenario is a
 * typed command plus an ordered list of steps. `DemoEngine` walks the steps,
 * deriving the terminal output, agent pipeline states, and progress bar from a
 * single cursor — so the three surfaces can never drift out of sync.
 *
 * Keep this file framework-free (no React, no icons) so it stays trivially
 * testable and the engine logic has one source of truth.
 */

/** The seven Helix agents, in pipeline order. */
export type AgentId =
  | "planner"
  | "analyzer"
  | "architect"
  | "engineer"
  | "reviewer"
  | "security"
  | "performance";

export type AgentState = "waiting" | "working" | "complete";

export interface AgentDef {
  id: AgentId;
  name: string;
  role: string;
}

/** Ordered agent roster — also the order the pipeline renders. */
export const AGENTS: readonly AgentDef[] = [
  { id: "planner", name: "Planner", role: "Breaks the request into steps" },
  { id: "analyzer", name: "Repository Analyzer", role: "Maps the existing codebase" },
  { id: "architect", name: "Architect", role: "Designs the solution" },
  { id: "engineer", name: "Engineer", role: "Writes the implementation" },
  { id: "reviewer", name: "Reviewer", role: "Catches logic errors" },
  { id: "security", name: "Security Auditor", role: "Scans for vulnerabilities" },
  { id: "performance", name: "Performance Auditor", role: "Optimizes hot paths" },
] as const;

export const AGENT_BY_ID: Record<AgentId, AgentDef> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
) as Record<AgentId, AgentDef>;

/** Visual style of a terminal line — drives glyph + color. */
export type LineKind =
  | "command" // the typed `helix …` prompt line
  | "thinking" // "> Understanding request…"
  | "success" // "✓ Found authentication layer"
  | "warn"
  | "output" // streamed code / log body
  | "done"; // final celebratory line

export interface TerminalLine {
  kind: LineKind;
  text: string;
  /** Which agent emitted this line (drives the inline agent chip). */
  agent?: AgentId;
}

export interface DemoStep {
  /** Terminal line revealed when this step becomes active. */
  line?: TerminalLine;
  /** Agent state transition applied at this step (cumulative). */
  agent?: { id: AgentId; state: AgentState };
  /** Target progress (0–100) once this step is active. */
  progress?: number;
  /** Stream the line token-by-token instead of fading it in whole. */
  stream?: boolean;
  /** Dwell time after the line appears, in ms (ignored for streamed steps). */
  hold?: number;
}

export interface Scenario {
  id: string;
  /** Shown after the `$` prompt and typed out character by character. */
  command: string;
  /** Filename shown in the editor pane while this scenario runs. */
  file: string;
  /** Language label for the editor chrome. */
  language: string;
  steps: DemoStep[];
}

const HOLD = 620; // default dwell between steps

/**
 * Primary scenario — the `helix generate saas-dashboard` flow from the brief.
 * Each agent lights up, does work, and reports a concrete result.
 */
const saasDashboard: Scenario = {
  id: "saas-dashboard",
  command: "helix generate saas-dashboard",
  file: "app/dashboard/page.tsx",
  language: "tsx",
  steps: [
    { line: { kind: "thinking", text: "Understanding request…" }, agent: { id: "planner", state: "working" }, progress: 6, hold: 700 },
    { line: { kind: "success", text: "Plan ready — 6 files, 1 migration", agent: "planner" }, agent: { id: "planner", state: "complete" }, progress: 14 },

    { line: { kind: "thinking", text: "Repository Analyzer scanning codebase…", agent: "analyzer" }, agent: { id: "analyzer", state: "working" }, progress: 20, hold: 760 },
    { line: { kind: "success", text: "Found authentication layer", agent: "analyzer" }, progress: 26 },
    { line: { kind: "success", text: "Found design system", agent: "analyzer" }, progress: 31 },
    { line: { kind: "success", text: "Found database schema", agent: "analyzer" }, agent: { id: "analyzer", state: "complete" }, progress: 36 },

    { line: { kind: "thinking", text: "Architect designing solution…", agent: "architect" }, agent: { id: "architect", state: "working" }, progress: 42, hold: 720 },
    { line: { kind: "success", text: "Composed layout, data layer, and charts", agent: "architect" }, agent: { id: "architect", state: "complete" }, progress: 50 },

    { line: { kind: "thinking", text: "Engineer generating implementation…", agent: "engineer" }, agent: { id: "engineer", state: "working" }, progress: 56 },
    { line: { kind: "output", text: "export default async function Dashboard() {", agent: "engineer" }, stream: true },
    { line: { kind: "output", text: "  const metrics = await getMetrics(orgId)", agent: "engineer" }, stream: true },
    { line: { kind: "output", text: "  return <DashboardShell metrics={metrics} />", agent: "engineer" }, stream: true },
    { line: { kind: "success", text: "Generated 6 files", agent: "engineer" }, agent: { id: "engineer", state: "complete" }, progress: 68 },

    { line: { kind: "thinking", text: "Reviewer validating code…", agent: "reviewer" }, agent: { id: "reviewer", state: "working" }, progress: 73, hold: 680 },
    { line: { kind: "success", text: "No logic errors — types check", agent: "reviewer" }, agent: { id: "reviewer", state: "complete" }, progress: 79 },

    { line: { kind: "thinking", text: "Security Auditor scanning…", agent: "security" }, agent: { id: "security", state: "working" }, progress: 84, hold: 680 },
    { line: { kind: "success", text: "No vulnerabilities found", agent: "security" }, agent: { id: "security", state: "complete" }, progress: 90 },

    { line: { kind: "thinking", text: "Performance Auditor optimizing…", agent: "performance" }, agent: { id: "performance", state: "working" }, progress: 94, hold: 640 },
    { line: { kind: "success", text: "Bundle optimized — 142 kB → 98 kB", agent: "performance" }, agent: { id: "performance", state: "complete" }, progress: 99 },

    { line: { kind: "done", text: "Dashboard generated successfully" }, progress: 100, hold: 2600 },
  ],
};

/** Secondary scenario — keeps the loop fresh by rotating in a bug-fix flow. */
const fixAuthBug: Scenario = {
  id: "fix-auth-bug",
  command: "helix fix “sessions expire too early”",
  file: "lib/auth/session.ts",
  language: "ts",
  steps: [
    { line: { kind: "thinking", text: "Understanding request…" }, agent: { id: "planner", state: "working" }, progress: 8, hold: 700 },
    { line: { kind: "success", text: "Reproduced — session TTL set in seconds, used as ms", agent: "planner" }, agent: { id: "planner", state: "complete" }, progress: 18 },

    { line: { kind: "thinking", text: "Repository Analyzer tracing call sites…", agent: "analyzer" }, agent: { id: "analyzer", state: "working" }, progress: 26, hold: 720 },
    { line: { kind: "success", text: "3 call sites touch session.maxAge", agent: "analyzer" }, agent: { id: "analyzer", state: "complete" }, progress: 38 },

    { line: { kind: "thinking", text: "Engineer applying fix…", agent: "engineer" }, agent: { id: "engineer", state: "working" }, progress: 48 },
    { line: { kind: "output", text: "- maxAge: ttl", agent: "engineer" }, stream: true },
    { line: { kind: "output", text: "+ maxAge: ttl * 1000", agent: "engineer" }, stream: true },
    { line: { kind: "success", text: "Patched session.ts", agent: "engineer" }, agent: { id: "engineer", state: "complete" }, progress: 62 },

    { line: { kind: "thinking", text: "Reviewer running tests in sandbox…", agent: "reviewer" }, agent: { id: "reviewer", state: "working" }, progress: 72, hold: 760 },
    { line: { kind: "success", text: "28 passing — added a regression test", agent: "reviewer" }, agent: { id: "reviewer", state: "complete" }, progress: 82 },

    { line: { kind: "thinking", text: "Security Auditor scanning…", agent: "security" }, agent: { id: "security", state: "working" }, progress: 90, hold: 640 },
    { line: { kind: "success", text: "No vulnerabilities found", agent: "security" }, agent: { id: "security", state: "complete" }, progress: 97 },

    { line: { kind: "done", text: "Fix verified — ready to ship" }, progress: 100, hold: 2600 },
  ],
};

export const SCENARIOS: readonly Scenario[] = [saasDashboard, fixAuthBug] as const;

/** Default per-step dwell when a step does not specify its own `hold`. */
export const DEFAULT_HOLD = HOLD;

/** All agent states reset to "waiting". */
export function initialAgentStates(): Record<AgentId, AgentState> {
  return AGENTS.reduce(
    (acc, a) => {
      acc[a.id] = "waiting";
      return acc;
    },
    {} as Record<AgentId, AgentState>,
  );
}
