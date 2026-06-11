# Handoff to Claude Code

This document is the entry point for building **Helix Studio** for real. The design phase is done; the HTML files are prototypes, not the production app. Your job is to turn them into a running Next.js application.

## Read first (in order)

1. `CLAUDE.md` — operating manual + coding standards (loaded automatically).
2. `PRODUCT.md` — what we're building and for whom.
3. `ARCHITECTURE.md` — stack, services, agent pipeline.
4. `DESIGN_SYSTEM.md` — tokens, components, accessibility rules.
5. `helix-studio-mockup.html` — **the UX source of truth.** Open it in a browser; every screen, interaction, and state lives here.
6. `TASKS.md` — the roadmap. Work Phase 1 first.

## Target stack (non-negotiable defaults)

Next.js (App Router) · TypeScript · TailwindCSS · shadcn/ui · Prisma · PostgreSQL · Auth.js · Vercel. Match `DESIGN_SYSTEM.md` exactly — no emoji in UI, single customizable accent (default `#3b82f6`), full dark/light themes.

## Suggested first session (Phase 1 foundation)

```bash
npx create-next-app@latest helix-studio --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd helix-studio
npx shadcn@latest init
npm i @prisma/client next-auth zod && npm i -D prisma
npx prisma init
```

Then, in order:

1. **Design tokens** — port the CSS variables from `helix-studio-mockup.html` (`:root[data-theme=...]`) into `globals.css` and a Tailwind theme. Implement the theme/accent/density/font-size customization engine (it already works in the prototype — copy the logic in the `<script>` block under "STATE / CUSTOMIZATION").
2. **App shell** — rail + top bar + command palette (⌘K). Mirror the prototype's structure and the Circuit Core brand mark (`assets/brand/circuit-core-mark.svg`). Favicon: `assets/brand/circuit-core-favicon.svg`.
3. **Auth** — Auth.js with GitHub + Google + credentials, matching `helix-login.html`.
4. **Routing** — one route per screen: `/`, `/editor`, `/analysis`, `/agents`, `/skills`, `/deployments`, `/settings`.
5. **Chat interface** — streaming, plan-first, inline diffs, agent indicators (see the IDE screen).

## Conventions

- Build incrementally; each screen should compile and render before moving on (`skills/incremental-implementation`).
- Type-safe, error/loading/empty states on every component (`DESIGN_SYSTEM.md`).
- Run the multi-agent review mindset: after writing code, self-review for logic, security, and performance (`skills/code-review-and-quality`, `skills/security-and-hardening`).
- Keep the prototype HTML files as living reference; do not delete them.

## Bundled skills

`skills/` contains 24 engineering skills (MIT). They're product content (Helix ships them to its users) **and** useful to you while building — invoke them when relevant.

## Definition of done for Phase 1

Auth works, the app shell + command palette render, theme/accent/density persist, and at least the Editor and Settings routes are live with real components. Then proceed through `TASKS.md`.
