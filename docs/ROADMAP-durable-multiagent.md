# Roadmap: Durable Background Jobs + Planner/Worker/Reviewer (massive refactors)

Status: PLAN (not started). Grounded in a codebase audit 2026-06-16.
Goal: make "refactor the whole app" / "turn this into X" / 30+ file changes run
reliably — surviving the serverless time limit and decomposed across agents.

## The two capabilities (and why order matters)

1. **Durable jobs** — a job that runs for many minutes across multiple serverless
   invocations, with checkpoint + resume + retry.
2. **Planner → workers → reviewer** — decompose a big request into sub-tasks,
   run them (eventually in parallel), and gate on a reviewer + verify.

Durability is the PREREQUISITE: a multi-agent refactor takes longer than one
request, so #2 is built on top of #1.

## What already exists (reuse, don't reinvent)

- `runAgentTurn` (src/lib/agent-turn.ts) — the provider-agnostic execution unit.
  Already supports `briefPrefix` (inject scope, never shown), `persist:false`
  (caller owns persistence), `intentId` (fold writes into one undoable intent),
  `mode:"plan"` (read-only, returns a numbered plan). This is the **worker**.
- `WorkspaceTask` model (prisma/schema.prisma) + /api/workspaces/[id]/tasks —
  a working job table (queued|running|done|error) + the `after()` create→run→
  persist lifecycle. Terminal-state only today; **extend it**.
- The premium-freshness CRON (src/app/api/cron/premium-freshness/route.ts) — the
  PROVEN "process until a ~280s deadline, then the next tick continues" pattern.
  This is the template for crossing the 300s wall.
- Progress channel (src/lib/progress.ts + /progress route) — Redis label that
  survives instance hops; reuse for live UX.
- NDJSON `phase` event stream (chat route + orchestrator.ts) — reusable transport
  for live planner/worker progress.
- Intent ledger (createAgentIntent) — group ALL of a refactor's writes under one
  undoable unit.
- `src/lib/orchestrator.ts` — a SEQUENTIAL, mostly-advisory 7-agent pipeline
  (planner/architect are prose prepended to ONE engineer turn; reviewer/security/
  perf are report-only and never gate). It's the UI skeleton, not a real
  planner→worker→reviewer. We evolve it.

## The hard problem: concurrent writes

Today every turn writes the shared `WorkspaceFile` overlay via `writeWorkspaceFiles`
with no scoping — two workers touching the same file = last-write-wins race
(that's why background tasks are capped at 3). Solving this cleanly is the crux.

**Chosen approach (pragmatic, staged):**
- The **planner assigns each sub-task a disjoint file scope** (paths/globs it may
  touch). Workers stay in their lane → no overlap → no merge needed for the
  common case.
- **Enforce scope**: add an optional `allowedPaths` to `ToolContext`; a worker's
  `write_files`/`edit_file`/`move_file`/`delete_file` outside its scope is
  rejected with a clear error (the model self-corrects).
- **Sequential commit with a conflict guard** (even when reasoning is parallel):
  if a worker's write touches a file another worker already changed this job,
  re-queue it to run AFTER, with the updated file in context. Defer true 3-way
  merge until data shows it's needed.

This avoids git-worktree/branch machinery inside the DB-overlay model.

## Architecture

### Durable job runner (Phase A)
- Driver: **Upstash QStash** (we already use Upstash Redis) to self-trigger the
  next step invocation, with the existing **cron as a backstop drainer** for
  stuck jobs. (Alternative to evaluate: the Vercel Workflow DevKit — native
  durable step/pause/resume/retry — vs. keeping it portable/self-hosted, which
  the cron+QStash path preserves. DECISION NEEDED.)
- Loop: enqueue job → worker route runs "slices" until a ~280s deadline →
  checkpoint to DB → if unfinished, re-enqueue the next slice → repeat. Heartbeat
  each slice; a backstop sweep fails jobs whose heartbeat is stale (replaces the
  fixed 6-min zombie age check).

### Planner → workers → reviewer (Phases B–C)
1. **Planner** — a structured-output call (JSON schema): ordered/parallelizable
   sub-tasks, each `{ title, scope: globs, dependsOn: [], acceptance }`. Persisted
   as `job.plan`. (Builds on the existing `mode:"plan"`.)
2. **Dispatcher** — schedule sub-tasks honoring `dependsOn`; Phase B runs them
   SEQUENTIALLY, Phase C runs independent ones in parallel (bounded concurrency).
   Each = `runAgentTurn` with `briefPrefix` (sub-task spec + scope), `persist:false`,
   shared `intentId`, scope-enforced ToolContext.
3. **Reviewer gate** — after workers, a reviewer turn checks the combined diff
   against each sub-task's `acceptance` + runs sandbox **verify**. On failure/gaps
   it **re-dispatches** targeted fix sub-tasks (bounded rework rounds, e.g. ≤2).
   This is the loop that's missing today.
4. **Integrator** — final sandbox build + auto-fix; persist one assistant summary;
   the whole job is ONE undoable intent.

### Data model (extend WorkspaceTask; finicky migration — additive, lock-free DDL)
- WorkspaceTask: add `state` (richer enum), `plan Json`, `cursor`/`stepIndex`,
  `checkpoint Json` (accumulated changes + per-subtask status), `attempts`,
  `heartbeatAt`, `scheduledAt`, `intentId`, `tokensSpent`.
- Optional `WorkspaceSubtask` table: per-worker rows `{ jobId, title, scope,
  state, diff, error }` (cleaner than packing into one Json; drives the UI board).

### UX
- Generalize the hard-coded 7-agent board (agent-pipeline-panel.tsx) into a
  **dynamic, variable-count** list: plan → N workers (each with scope + state) →
  reviewer verdict. Reuse the NDJSON `phase` channel (widen the phase-id union to
  `worker:<n>`).
- Durable progress that survives navigation (reuse progress channel + poll the
  job row). A **cancel** button. On return, re-attach to the running job.
- Before launching: a **cost/scope estimate + confirm** ("~28 files across 9
  tasks, est. ~N tokens — run as a background job?").

## Build order (each phase ships value independently)

- **Phase A — Durable runner.** Extend WorkspaceTask + QStash step-loop + cron
  backstop + checkpoint/resume/retry/heartbeat. Migrate the EXISTING single-turn
  background task onto it (proves the rails). Ships: jobs that no longer die at
  5 min; cancel; durable progress.
- **Phase B — Structured planner + scoped sequential workers + reviewer gate.**
  Plan→workers (sequential, scope-enforced, one intent)→reviewer rework loop→
  verify. Dynamic UI board. Ships: reliable, reviewed big refactors (durable via A).
- **Phase C — Parallelism + conflict guard.** Run disjoint-scope sub-tasks in
  parallel with bounded concurrency + re-queue-on-overlap. Ships: speed.
- **Phase D — Polish.** Cost estimate+confirm, pre-job snapshot/rollback,
  per-step tokens/timing in /admin, tuning concurrency + rework caps.

## Cost / safety / gating
- ADMIN-gated first (consistent with the Phase-2 transform-mode rollout), then
  pro/team.
- Per-job token budget (extend checkTokenBudget); hard caps on sub-task count and
  rework rounds; estimate-and-confirm before launch.
- Whole job = ONE intent → one-click undo; optional snapshot before start.

## Open decisions (resolve before starting)
1. **Durability driver**: QStash + cron backstop (portable, reuses Upstash) vs.
   Vercel Workflow DevKit (native durable primitives, Vercel-coupled).
2. **Isolation**: disjoint-scope + sequential-commit-with-conflict-guard (chosen)
   vs. real per-worker staging + 3-way merge (defer unless needed).
3. **Evolve orchestrator.ts** into the real system vs. build fresh and retire the
   advisory pipeline (lean: evolve the UI, replace internals for big jobs, keep
   the lean single-turn path for small ones).
4. Trigger: explicit "big refactor / run as job" affordance vs. auto-detect large
   requests and offer it.
