# Intent Ledger & Intentional Undo

> Shipped 2026-06-12 · lives in the editor (`/editor/[id]`) · diagram: [`diagrams/intent-ledger-flow.svg`](diagrams/intent-ledger-flow.svg)

## What it is

Two connected capabilities that give every line of code in a Helix workspace a memory:

1. **Line-By-Line Intent Ledger** — every change (an AI build turn, a manual editor save, or an applied undo) is recorded as an *intent* with full before/after snapshots of each file it touched. Any line in the editor can answer: *who introduced me, from which request, implementing which plan step, protected by which tests?*
2. **Intentional Undo** — revert an *idea*, not a commit. "Remove the invite feature" reverses every file that intent introduced — code, new files, deletions — while preserving all later work, behind a preview diff the user approves.

## Data model

Two tables (Prisma models in `prisma/schema.prisma`, idempotent DDL in `src/lib/schema-upgrades.ts`):

| Model | Purpose | Key fields |
|---|---|---|
| `WorkspaceIntent` | One per user request that changed files | `kind` (agent / manual / undo), `status` (open / final / reverted), `title`, `userRequest`, `planText` (approved plan), `reasoning` (agent's summary), `revertsIntentId` |
| `WorkspaceChange` | One per file an intent touched | `path`, `beforeContent`, `afterContent` (full snapshots, null = absent/deleted), `baseUnknown` |

**Why full snapshots, not diffs:** files are capped at 48 KB, so the worst case is bounded; exact-restore becomes a string compare; and a missing link can't break a replay chain — drift from uncaptured writes self-heals into an "uncaptured" blame bucket. Retention keeps the newest **200 intents per workspace** (older ones prune; their content folds into the "base" attribution).

## Capture (write chokepoint)

Every write in the system funnels through two functions in `src/lib/workspace.ts` — `writeWorkspaceFiles()` and `deleteWorkspaceFile()` — which accept an optional `capture: { intentId }`:

- **AI turns** — `runAgentTurn()` (`src/lib/agent-turn.ts`) creates the intent *lazily* on the first mutating tool call (read-only turns leave no rows), threads it through `ToolContext.getIntentId`, and finalizes it with the assistant's reply as `reasoning`. Approved plans arrive with a known message prefix and are stored as `planText`. Verify auto-fix turns inherit the parent's intent so fixes fold in.
- **Manual saves** — `POST /api/workspaces/[id]/files` drops no-op saves, then records the rest as one `kind: "manual"` intent.
- **Undo** — `applyUndo()` writes through the same captured path, so an undo is itself an intent — and therefore undoable.

Capture is fail-open: if snapshotting fails, the write still succeeds and blame self-heals later.

## Blame (line → intent)

`computeLineLedger()` in `src/lib/intent-ledger.ts` replays a file's snapshots oldest-first with jsdiff `diffLines`: added lines take that change's intent, surviving lines carry attribution forward, and a final diff against live content buckets unexplained lines as *uncaptured*. Output is run-length-encoded ranges + intent metadata + a protecting-tests heuristic (test files that mention the file's basename). Computed only when the ledger UI asks — never per keystroke.

## Undo engine

`src/lib/undo.ts`, per file of the target intent (A = before, B = after, C = current):

| Case | Method |
|---|---|
| `C === B` (untouched since) | **exact** — restore A mechanically |
| Later edits elsewhere in the file | **patch** — inverse patch B→A applied to C (jsdiff, `context: 1`, `fuzzFactor: 0`; a context mismatch *is* overlap) |
| Later edits overlap the intent's own lines, created-then-edited, deleted-then-recreated, unknown base | **ai** — one no-tools model call produces the post-revert file (capped 8 files/preview, never auto-applied) |

**Preview/apply protocol:** `undo-preview` returns the proposed entries + sha256 `baseHashes` of live content and never writes; `undo-apply` re-verifies those hashes (workspace moved on → **409**, client re-previews), records the revert as a new `undo` intent, and marks the target `reverted`.

## API routes (all behind `guardWorkspace` + rate limits)

| Route | Returns |
|---|---|
| `GET /api/workspaces/[id]/ledger?path=` | line ranges → intents, tests |
| `GET /api/workspaces/[id]/intents` | newest-first intent timeline |
| `POST /api/workspaces/[id]/ledger/ask` `{path, line, question: "why"\|"impact"}` | grounded AI answer (token-metered) |
| `POST /api/workspaces/[id]/intents/[intentId]/undo-preview` | proposal: entries, unresolved, baseHashes |
| `POST /api/workspaces/[id]/intents/[intentId]/undo-apply` | `{changes}` or 409 on stale preview |

## UI

- **Fresh-change highlight (Code tab, always on):** lines the latest turn introduced get a soft accent background; hovering shows a compact provenance card next to the block (click pins it) — change title, when, a short why, *Why? / If removed?* AI buttons, and *Undo*.
- **Ledger toggle (Code tab):** colored gutter bars per attribution (accent = AI, amber = manual, red = undo, dimmed = uncaptured) + a full side panel for any clicked line — request, plan step, reasoning, sibling files, protecting tests, AI questions, undo.
- **Intents tab:** the whole change timeline; per-intent **Undo** opens the preview dialog (entry list with exact / patched / AI badges, Monaco side-by-side diff, explicit Apply).
- The Save button reads **"Saved ✓"** when nothing is dirty — AI edits are persisted automatically; Save is for manual editor changes, Push ships to the repo.

## Limits & notes

- Lines written before the feature shipped (and imported-repo base lines) show "predates the ledger" — provenance accrues from capture onward.
- AI-untangled revert files always carry an explicit **AI** badge in the preview and deserve a close look before applying.
- The intent `alternatives` field (rejected approaches) is reserved; an env-gated summarizer can populate it later.
- End-to-end test: `node scripts/e2e-intent-ledger.mjs` (27 checks: capture → blame → undo → undo-the-undo → stale-preview 409).
