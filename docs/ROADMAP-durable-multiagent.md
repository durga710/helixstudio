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

**Chosen approach — fast common case + correct hard case (not the lazy path):**
We want true parallelism (speed) AND correctness, so it's a hybrid, layered so the
fast path covers ~90% and the robust path catches the rest:
- **Planner partitions sub-tasks into DISJOINT file scopes** wherever possible.
  Disjoint workers run fully in parallel with **no merge at all** — the fast,
  common case.
- **Scope enforcement**: an optional `allowedPaths` on `ToolContext`; writes
  (`write_files`/`edit_file`/`move_file`/`delete_file`) outside a worker's scope
  are rejected with a clear error so the model stays in its lane.
- **Per-worker staging overlay + hunk-level merge** for the unavoidable overlaps
  (e.g. two features that both edit one shared router/registry file). Each worker
  writes to its own staging copy; an integrator applies **non-overlapping hunks
  automatically** (3-way against the job's base snapshot) and only escalates a
  true line-level conflict (rare) to a fast reconciliation turn. This is the
  "don't cut corners" piece — real merge, not last-write-wins.
- Base snapshot per job (the file set at job start) is the 3-way merge ancestor.

Net: independent tasks parallelize freely (fast); overlapping tasks merge
correctly (robust). No git-worktree/branch machinery — staging is just a scoped
copy in the DB overlay keyed by job+worker.

## Architecture

### Durable job runner (Phase A)
- Driver (LOCKED): **Upstash QStash** (we already use Upstash Redis) to
  self-trigger the next step invocation, with the existing **cron as a backstop
  drainer** for stuck jobs.
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

- **Phase A — Durable runner. ✅ DONE 2026-06-16 (commit `c300d6e`).** One JSONB
  `WorkspaceTask.job` state machine; pure slice runner (src/lib/jobs/runner-core.ts,
  11/11 tests) + store/driver; `/api/jobs/[id]/step` (slice + chain) and
  `/api/cron/jobs` (backstop, not yet wired in vercel.json); driver = QStash if
  `QSTASH_TOKEN` else after()-chaining self-invoke. Background-task button migrated
  onto the rails. NOTE: the `job` column applies on the next cold boot/deploy
  (lock-free upgrade); QStash + the cron entry are optional accelerators. Next:
  add a `cancel` endpoint + a richer durable progress UI when Phase B lands.
- **Phase B — Structured planner + scoped sequential workers + reviewer gate.**
  ✅ ENGINE DONE 2026-06-16 (commit `e894c4f`): planner (jobs/planner.ts) →
  scoped sequential workers (runAgentTurn `scope` → ToolContext.allowedPaths,
  enforced in workspace-tools) → reviewer gate with bounded rework
  (jobs/reviewer.ts, MAX_REWORK_ROUNDS=2). Dynamic jobs via step.appendSteps on
  runner-core. Trigger: POST /api/workspaces/[id]/refactor (admin preview) +
  jobs/detect.ts. 34 unit tests (runner + parse + scope + detect). REMAINING
  Phase-B polish: one job-level intent (whole-refactor undo), the dynamic agent
  board UI, wiring auto-detect+confirm into the chat flow, and an optional final
  sandbox-verify step.
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

## Decisions (LOCKED 2026-06-16)
1. **Durability driver**: ✅ **QStash + cron backstop** — self-trigger each step
   via Upstash QStash (reuses our Upstash account, portable, no Vercel lock-in);
   a cron sweeps stuck jobs.
2. **Isolation**: ✅ **Hybrid (best + fast)** — disjoint-scope parallelism for the
   common case + per-worker staging with hunk-level 3-way merge for unavoidable
   overlaps (see "The hard problem" above). Explicitly NOT sequential-only and NOT
   last-write-wins; correctness without giving up speed.
3. **Orchestrator**: ✅ **Evolve orchestrator.ts** — reuse its UI/streaming, replace
   the advisory internals with the real planner→workers→reviewer for big jobs;
   keep the lean single-turn path for small ones.
4. **Trigger**: ✅ **Auto-detect + confirm** — detect large/structural requests,
   show a scope + cost estimate, and let the user confirm running it as a durable
   multi-agent job (with an explicit override always available).
