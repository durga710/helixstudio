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
- [x] **Repo-aware chat** — active workspace context (analysis + relevant files) grounds every answer

## Phase 2 — Repository intelligence
- [x] **Real** repo import — public GitHub tarball fetch, parse, index (`src/lib/repo/import.ts`)
- [ ] Folder upload
- [x] Parsing, chunking + search over imported repos (`/api/search`; Qdrant swap point)
- [x] **Real** static analysis of imported repos (languages, deps, risks) → Analysis screen

## Phase 3 — Agents
- [x] Planner, Architect, Engineer, Reviewer, Security, Performance (SSE pipeline)
- [x] **Real AI agents** — with a key (BYOK/platform), each step runs a live Claude analysis of the workspace
- [x] Confirm-before-action gating (pauses before the Engineer step)
- [x] Final combined output

## Phase 4 — Developer tools
- [x] File explorer, tabs, syntax-highlighted code view + diff decorations
- [x] Diff viewer (inline diff cards in chat with accept/reject)
- [x] Sandboxed terminal (allowlisted commands against the workspace copy)
- [x] Test runner (staged vitest-style output)
- [x] Inline editing — edit/save/create files in the active workspace (`/api/files`)

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

## Phase 8 — Desktop (like Cursor)
- [x] Electron shell (`desktop/`) with a hardened native bridge
- [x] **Local engine**: the full Next.js server is bundled into the binary and runs on 127.0.0.1 (v0.2)
- [x] Real local shell in the editor (folder picker + time-boxed command execution)
- [x] CI installers: dmg / exe / AppImage on `desktop-v*` tags (draft GitHub Release)
- [ ] Open local folders in the Editor (read/write via the bridge)
- [ ] Apply AI diffs to local files; local git operations
- [ ] Auto-updates (electron-updater) + code signing

## Production notes
- Demo mode runs everything in-memory; connect `DATABASE_URL` for PostgreSQL
  persistence (see `docs/DATABASE.md`) and `ANTHROPIC_API_KEY` for live AI.
- Domain: helixstudio.org on Vercel — see `docs/DEPLOYMENT.md`.
- Engine token/fix-loop hardening (deterministic fixers, delete-storm guard,
  error-log distillation) — see `docs/ENGINE-TOKEN-HARDENING.md`.
