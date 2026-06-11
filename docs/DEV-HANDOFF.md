# Helix Studio — Developer Handoff

Welcome aboard. This is everything you need to run, understand, and integrate
code into Helix Studio. Read this top to bottom once; it's 10 minutes.

**Live product:** https://helixstudio.org · demo login `demo@helixstudio.org` / `helix-demo`
**Repo:** https://github.com/durga710/helixstudio · deploys to Vercel from `main`
**Desktop app:** GitHub Releases (`desktop-v*` tags) — macOS/Windows/Linux installers

---

## 1. Run it locally

```bash
npm install            # postinstall runs `prisma generate`
npm run dev            # http://localhost:3000
```

That's it — **no env vars required**. Without configuration the app runs in
*demo mode*: seeded in-memory data, simulated AI, the demo login. Each
capability upgrades independently via env vars (see §6).

Production-mode run (what Vercel and the desktop app execute):

```bash
npm run build
cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
PORT=3000 node .next/standalone/server.js
```

Desktop shell: `cd desktop && npm install && HELIX_DESKTOP_URL=http://localhost:3000 npm start`

Before any PR: `npm run lint && npm run build` must pass — CI enforces both
plus `prisma validate`.

---

## 2. Repo layout

```
src/app/                    Next.js 16 App Router
  (app)/…                   Authed screens: dashboard, editor, analysis, agents,
                            skills, deployments, settings, team
  welcome/  login/          Public marketing + sign-in
  api/…                     Route handlers (see §4)
src/components/
  ui/                       Primitives: Button, Card, Pill, Dialog, Switch,
                            Segmented, Input, Toast, Markdown (shadcn-style, cva)
  shell/                    Rail, Topbar, Command palette (⌘K), modals
  screens/                  Screen-level components (client)
  brand.tsx  logos.tsx      Circuit Core mark, helix glyph, circuit traces
src/lib/
  store.ts                  ★ THE data layer (see §3)
  demo-seed.ts  types.ts    Seed data + entity types
  auth.ts                   Auth.js v5 (demo creds, conditional GitHub/Google)
  ai/provider.ts            Model routing: BYOK/platform key → Claude; else mock
  repo/import.ts            Real GitHub tarball fetch + in-memory tar parser
  repo/analyze.ts           Real static analysis (deps, risks, entry points)
  repo/context.ts           Workspace context assembly for chat/agents
  repo/search.ts            Lexical chunk search (Qdrant swap point)
  agents/pipeline.ts        Six-agent pipeline: real Claude per step, or scripted
  db.ts  password.ts        PostgreSQL (Prisma 7 + pg adapter) + scrypt hashing
                            — groundwork, activates with DATABASE_URL
prisma/schema.prisma        Full schema, every phase (validated in CI)
desktop/                    Electron shell: bundles the Next standalone server,
                            boots it on 127.0.0.1; native bridge = local shell
                            + folder picker (preload.js, context-isolated)
scripts/screenshots.cjs     Captures all screens headlessly for design review
.github/workflows/          ci.yml (lint+build+prisma) · desktop.yml (installers)
docs/                       DEPLOYMENT, DATABASE, DESKTOP, this file
helix-studio-mockup.html    ★ UX source of truth — keep fidelity to it
```

## 3. The data layer — read this before integrating anything

All state flows through **`src/lib/store.ts`**: a seeded in-memory singleton
(`globalThis`-cached) exposing typed accessors and mutators. Key concepts:

- `store()` — the root object (projects, activity, memory, team, …)
- `activeWorkspace()` — the **per-project working copy** `{ tree, files,
  analysis }` that backs the Editor, Analysis screen, search, and terminal
- Mutators (`addImportedProject`, `upsertMemory`, `createInvite`, …) keep
  invariants (audit log, activity feed) — **never mutate `store()` fields
  directly from new code; add a mutator.**

Demo-mode data resets per serverless instance — that's expected. PostgreSQL
persistence (write-through from these mutators) is the in-flight workstream;
`prisma/schema.prisma` already models every entity 1:1 with `types.ts`.

## 4. API surface

All routes check `auth()` first and return JSON errors. Conventions: zod for
every request body, `export const dynamic = "force-dynamic"` on store-backed
routes, SSE via `ReadableStream` for streaming.

| Route | What |
|---|---|
| `POST /api/chat` | Streams Claude (BYOK cookie → platform key → mock). Injects workspace context. |
| `GET /api/agents/run?step=` | SSE: one pipeline step (real Claude w/ key, scripted without) |
| `POST/GET/PATCH /api/repos` | Real GitHub import · list · switch active workspace |
| `PUT /api/files` | Edit/create files in the active workspace (traversal-guarded) |
| `GET /api/search?q=` | Lexical search over the active workspace |
| `POST /api/terminal` | Allowlisted sandbox commands (desktop app uses a real shell instead) |
| `GET/POST/DELETE /api/memory` | Phase-5 memory entries |
| `GET/POST /api/team` | Members, RBAC role changes, invites |
| `GET/POST /api/deployments` (+`/log`) | Deploy simulation + SSE build log (`VERCEL_TOKEN` swap point) |
| `POST/GET/DELETE /api/keys` | BYOK: user's Anthropic key in an httpOnly cookie |
| `GET /api/health` | Public deployment fingerprint (commit, env, mode) |

## 5. Integrating your existing code

Pick the shape that matches what you built:

1. **A new screen** → `src/app/(app)/<name>/page.tsx` (server component pulls
   from `store()`, client logic in `src/components/screens/<name>-screen.tsx`)
   + a nav entry in `components/shell/rail.tsx` and the command palette.
2. **A new API/service** → route under `src/app/api/<name>/route.ts`
   (auth + zod + the conventions above); domain logic in `src/lib/<name>/`.
3. **A library/engine** (parser, indexer, model client, …) → `src/lib/`,
   typed, no React imports; surface it through a route or a screen.
4. **An external app** you want embedded → talk to us first; the answer is
   usually "port the screens onto the store interface," not an iframe.

**Non-negotiables** (CI + review enforce):
- Use the design tokens (`bg-panel`, `text-txt2`, `border-border2`,
  `text-accent`, `brand-gradient-*`) — never raw hex in app screens. Match
  the mockup's density and tone; no emoji in UI.
- Every component handles loading/error/empty states.
- TypeScript strict; zod-validate every request body; check `auth()` in
  every route; scope by the session, never trust client-sent IDs.
- Keyboard + `aria-*` on interactive elements.
- One focused PR per change with a why-first commit message. CI must be
  green; `main` auto-deploys to helixstudio.org on merge.

## 6. Environment variables (all optional — each unlocks a capability)

| Var | Unlocks |
|---|---|
| `ANTHROPIC_API_KEY` | Platform-wide real Claude (users can also BYOK in Settings) |
| `DATABASE_URL` | PostgreSQL persistence + real accounts (in-flight; schema ready) |
| `AUTH_GITHUB_ID/SECRET` | GitHub sign-in (buttons appear automatically) |
| `AUTH_GOOGLE_ID/SECRET` | Google sign-in |
| `AUTH_SECRET` | Session signing (demo mode self-supplies; set it in prod) |
| `QDRANT_URL/API_KEY` | Vector search upgrade point (`repo/search.ts`) |
| `VERCEL_TOKEN` | Live deployment data (`api/deployments`) |

## 7. Gotchas that will bite you

- **Next 16**: `searchParams`/`params` are Promises in pages; `middleware.ts`
  is now `proxy.ts` (we use neither — auth-gate in `(app)/layout.tsx`).
  Read `node_modules/next/dist/docs/` before assuming Next 14/15 behavior.
- **Prisma 7**: no `url` in `schema.prisma` — it lives in `prisma.config.ts`;
  client output is `src/generated/prisma` (gitignored, built by postinstall).
- **ESLint** bans sync `setState` in effects (`react-hooks/set-state-in-effect`)
  — hydrate from localStorage exactly like `theme-provider.tsx` does.
- **`output: "standalone"`** in `next.config.ts` is for the desktop bundle —
  don't remove it; Vercel ignores it.
- The Vercel project has **no special settings**: root directory empty,
  framework forced via `vercel.json`. Don't "fix" the dashboard.
- Desktop bridge: the page never gets Node — anything native goes through
  `desktop/preload.js` (`window.helixDesktop`), origin-checked in `main.js`.

## 8. Who to ask

Open a draft PR early — CI + Vercel preview will tell you most of what you
need. Architecture questions: start a thread on the PR. The prototype HTML
files at the repo root are the design reference; `TASKS.md` is the live
roadmap with what's done and what's open.
