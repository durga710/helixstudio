/* Multi-agent workflow (Phase 3).
 *
 * The pipeline runs one specialist at a time; the client orchestrates step
 * order so confirm-before-action gating can pause between steps (the gate is
 * enforced in the UI before the Engineer step is requested). Each step streams
 * progress events over SSE from /api/agents/run.
 */

export const PIPELINE_STEPS = [
  "planner",
  "architect",
  "engineer",
  "reviewer",
  "security",
  "performance",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export interface StepEvent {
  type: "start" | "log" | "done";
  step: PipelineStep;
  message?: string;
  result?: string;
}

interface StepScript {
  name: string;
  result: string;
  logs: string[];
}

export const STEP_SCRIPTS: Record<PipelineStep, StepScript> = {
  planner: {
    name: "Planner",
    result: "Planned",
    logs: [
      "Parsing task: team invitations — email + single-use join code",
      "Found 3 affected areas: schema, API routes, admin UI",
      "Ordered 5 tasks with dependencies; estimated 2 migrations",
    ],
  },
  architect: {
    name: "Architect",
    result: "Designed",
    logs: [
      "Comparing invite-token table vs JWT-only invites",
      "Chose token table — supports revoke and audit",
      "Join code stored hashed; compared on accept",
    ],
  },
  engineer: {
    name: "Engineer",
    result: "Built",
    logs: [
      "Added Invite model + migration (prisma/schema.prisma)",
      "Wrote createInvite / revokeInvite + email send (app/api/invites.ts)",
      "Built admin resend / revoke / copy-link controls",
    ],
  },
  reviewer: {
    name: "Reviewer",
    result: "Reviewed",
    logs: [
      "Verified token expiry handling on accept path",
      "Flagged: copy-link must expire with the invite — fixed",
      "Types and error states verified across 6 files",
    ],
  },
  security: {
    name: "Security Auditor",
    result: "Cleared",
    logs: [
      "Scanned diff for auth, injection, and secret leaks",
      "Join-code comparison is constant-time; codes hashed at rest",
      "0 secrets leaked · 0 injection risks · org scoping verified",
    ],
  },
  performance: {
    name: "Performance Engineer",
    result: "Optimized",
    logs: [
      "Checked query plans on invite lookups — index on (orgId, status)",
      "Email send moved off the request path (queued)",
      "No render regressions in admin table",
    ],
  },
};

export const FINAL_OUTPUT = {
  title: "Team invitations — combined recommendation",
  sections: [
    { h: "Understanding", body: "Emailed invites plus a single-use join code, with admin resend / revoke / copy-link controls." },
    { h: "Plan", body: "Invite model → createInvite + email → admin controls → acceptance flow → tests." },
    { h: "Implementation", body: "12 additions across app/api/invites.ts, InviteCard.tsx, and schema.prisma; one migration." },
    { h: "Review", body: "Copy-link expiry aligned with invite expiry; types verified." },
    { h: "Security", body: "Codes hashed at rest, constant-time compare, org-scoped queries. No findings." },
    { h: "Performance", body: "Indexed lookups; email delivery queued off the request path." },
    { h: "Next steps", body: "Run the migration, then ship behind the team-invites flag and monitor acceptance rates." },
  ],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* runStep(step: PipelineStep): AsyncGenerator<StepEvent> {
  const script = STEP_SCRIPTS[step];
  yield { type: "start", step };
  for (const log of script.logs) {
    await sleep(420);
    yield { type: "log", step, message: log };
  }
  await sleep(300);
  yield { type: "done", step, result: script.result };
}
