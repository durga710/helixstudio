# Engine Hardening — Kill the Token-Burning Fix Loops

> Shipped 2026-06-20. PRs #56, #57, #58, #59, #60, #62.

## The diagnosis

The build engine could spend **150k–575k tokens on a single build attempt** and
still never converge. Production transcripts showed two repeating patterns:

1. **Looping on trivial, statically-decidable errors.** An import whose **case**
   didn't match the file (`import Sidebar from "@/components/sidebar"` when the
   file is `Sidebar.tsx`) sent the model around the loop 3+ times — and it
   eventually **deleted ~20 files** (the layout, every route page, half the
   components), destroying the app, *without* fixing the error.
2. **A named import of a symbol a module never named-exported** (`import { DataTable }`
   from a module that only `export default`s it) → `Unsupported Server Component
   type: undefined` at runtime.

Two structural causes amplified the cost:

3. **No prompt caching on the default provider.** The platform default is
   GPT-OSS 120B on the Bedrock *runtime* OpenAI-compatible endpoint
   (`bedrock-runtime.*.amazonaws.com/openai/v1`), which does not support response
   caching — so the full conversation is re-sent at full price on **every** hop.
   The account is entitled to GPT-OSS 120B/20B only (every Claude id is 403), so
   "route to a stronger model + cache the prefix" is not available.
4. **The fix-feedback was an 8k log tail** — webpack spinner lines, the
   tsconfig-reconfigured notice, npm banners — re-sent at full price every fix
   round, carrying almost no signal.

Because caching and strong-model routing are off the table, the levers are
**send less, and loop less.**

## The fixes

| Area | Change | File(s) |
|---|---|---|
| Deterministic fixers | Repair the statically-decidable errors over the file overlay **before** the build — zero tokens, no sandbox, no model | `src/lib/fixers/index.ts` |
| — import casing | Rewrite a specifier that resolves case-insensitively to exactly one file but with the wrong case; ambiguous collisions are skipped | `fixImportCasing` |
| — missing export | Add `export` to a top-level symbol a named import wants but the module defines unexported; for a default-only export, add a named export alongside it (the real `DataTable` bug) | `fixMissingExports`, `hasNamedExport`, `hasDefaultExportOf` |
| — use client | Prepend `"use client"` to a component that calls a client-only hook (`useState`/`useRouter`/…) and lacks a directive; never touches a file that already has `use client`/`use server` | `fixMissingUseClient` |
| — default export | A Next page/layout/etc. with no default export and exactly one top-level PascalCase component gets `export default <Name>;`; ambiguous cases are skipped | `fixMissingDefaultExport` |
| Runs everywhere | The fix pass runs in the main build turn (alongside `autoWireFeature`), so it protects **every** build — including guests / demo / no-sandbox, where `verifyBuild` is skipped | `src/lib/agent-turn.ts`, `src/lib/verify.ts` (`applyDeterministicFixes`) |
| Error distillation | Feed the model only the actionable error region (compile failure, `path:line:col` frames, tsc `TS####` lines), not the 8k log tail — a 5–15× cut on a typical Next failure | `src/lib/build-log.ts` (`extractBuildError`), used in `verifyBuild` |
| Delete-storm guard | A turn may delete at most `max(12, ceil(0.5 × project size))` files; beyond that `delete_file` refuses with a message steering the model to fix the error instead | `src/lib/delete-guard.ts`, wired in `src/lib/workspace-tools.ts` + seeded in `src/lib/agent-turn.ts` |

## Tests

First unit-test runner in the repo: zero-dep `node --test` with type stripping,
exposed as `npm run test:unit` and a fast CI `unit` job. **34 tests**, with the
two production failures as named fixtures (the `Sidebar` casing loop, the
`DataTable` missing-export crash) and the real noisy Next transcript as the
`extractBuildError` fixture.

```
npm run test:unit   # 34 passing, ~70ms
```

## How to extend the fixers

Add a new pass in `src/lib/fixers/index.ts` as a pure `(files, …) => FixOutcome`
function, compose it in `runDeterministicFixes`, and add a `FixKind`. Keep each
pass **conservative**: only act on an unambiguous, statically-decidable signal —
a wrong "fix" is worse than none. Cover it with a test in `index.test.ts` (mirror
a real failure where possible). A good candidate not yet built: duplicate-default-export
detection (two `export default` statements in one file — a build error, but the
correct one to keep is ambiguous, so it likely wants detect-and-report).

## What's deliberately NOT done

- **Prompt caching / strong-model routing** — impossible on the Bedrock GPT-OSS
  runtime endpoint with the current entitlement. Revisit if an Anthropic/OpenAI
  key is added: it's the single biggest remaining lever (~90% input cost cut).
- **20B routing for fix-turns** — GPT-OSS 20B degrades to narrating instead of
  calling tools on multi-tool work; not worth the convergence risk.
- **Auto-revert on regression** — the intent ledger + `undo.ts` already provide
  user-facing revert; automatic revert is behaviorally aggressive and was left out.
- **Warm/incremental build signal** (`tsc --watch` vs cold `next build`) — a
  latency win, not a token win, and lower leverage without caching.
