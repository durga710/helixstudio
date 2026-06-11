# Helix Studio — Roadmap

## Phase 0 — Design
- [x] Define product, architecture, and design system
- [x] Interactive UI prototype (`helix-studio-mockup.html`) — 7 screens
- [x] Bundle 24 agent skills (`skills/`)
- [x] Live theming: dark/light, accent, density, font size
- [ ] Marketing landing page for helixstudio.org
- [ ] Skill detail view

## Phase 1 — Foundation
- [x] Next.js + TypeScript + Tailwind + shadcn/ui scaffold (`helix-studio/`)
- [x] Auth.js authentication (demo credentials + conditional GitHub/Google OAuth)
- [x] Prisma + PostgreSQL schema (`helix-studio/prisma/schema.prisma`)
- [x] App shell, sidebar, command palette (⌘K)
- [x] Chat interface + model routing (Haiku/Sonnet/Opus via Anthropic SDK; mock fallback)

## Phase 2 — Repository intelligence
- [x] Repo import (GitHub URL → indexing queue)
- [ ] Folder upload
- [x] Parsing, chunking + search (`/api/search`; in-memory scorer with Qdrant swap point)
- [x] Static analysis → Repository Analysis screen

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
