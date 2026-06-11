# Helix Studio — Roadmap

## Phase 0 — Design
- [x] Define product, architecture, and design system
- [x] Interactive UI prototype (`helix-studio-mockup.html`) — 7 screens
- [x] Bundle 24 agent skills (`skills/`)
- [x] Live theming: dark/light, accent, density, font size
- [x] Marketing landing page for helixstudio.org (`/welcome` — signed-out visitors land here)
- [x] Skill detail view (dialog on the Skills screen)

## Phase 1 — Foundation
- [x] Next.js + TypeScript + Tailwind + shadcn/ui scaffold (repo root)
- [x] Auth.js authentication (demo credentials + conditional GitHub/Google OAuth)
- [x] Prisma + PostgreSQL schema (`prisma/schema.prisma`)
- [x] App shell, sidebar, command palette (⌘K)
- [x] Chat interface + model routing (Haiku/Sonnet/Opus via Anthropic SDK; mock fallback)

## Phase 2 — Repository intelligence
- [x] **Real** repo import — public GitHub tarball fetch, parse, index (`src/lib/repo/import.ts`)
- [ ] Folder upload
- [x] Parsing, chunking + search over imported repos (`/api/search`; Qdrant swap point)
- [x] **Real** static analysis of imported repos (languages, deps, risks) → Analysis screen

## Phase 3 — Agents
- [x] Planner, Architect, Engineer, Reviewer, Security, Performance (SSE pipeline)
- [x] Confirm-before-action gating (pauses before the Engineer step)
- [x] Final combined output

## Phase 4 — Developer tools
- [x] File explorer, tabs, syntax-highlighted code view + diff decorations
- [x] Diff viewer (inline diff cards in chat with accept/reject)
- [x] Sandboxed terminal (allowlisted commands against the workspace copy)
- [x] Test runner (staged vitest-style output)
- [ ] Inline editing (writes back to workspace)

## Phase 5 — Memory
- [x] User preferences (localStorage + memory API)
- [x] Project memory · agent task history (Settings → Memory, `/api/memory`)

## Phase 6 — Deployments
- [x] Deploy main, streaming build logs, environment cards, rollback action
- [ ] Live Vercel API integration (`VERCEL_TOKEN` swap point in `/api/deployments`)

## Phase 7 — Enterprise
- [x] Team workspace, RBAC role management, invitations (create/revoke/copy-link)
- [x] Audit log
- [ ] SSO (SAML/OIDC via Auth.js — config-gated)

## Production notes
- Demo mode runs everything in-memory; connect `DATABASE_URL` for PostgreSQL
  persistence (see `docs/DATABASE.md`) and `ANTHROPIC_API_KEY` for live AI.
- Domain: helixstudio.org on Vercel — see `docs/DEPLOYMENT.md`.
