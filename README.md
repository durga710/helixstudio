<p align="center">
  <img src="assets/brand/png/full-lockup-2400.png" alt="Helix Studio" width="460"/>
</p>

<h3 align="center">The AI Operating System for Software Engineering</h3>

<p align="center">
  Plan, build, review, deploy, and scale software with a team of AI engineering
  agents working directly inside your codebase — from idea to production without
  leaving your workspace.
</p>

<p align="center">
  <a href="https://helixstudio.org"><b>🌐 Live&nbsp;Site</b></a> &nbsp;·&nbsp;
  <a href="https://helixstudio.org/build"><b>⚡ Start&nbsp;Building</b></a> &nbsp;·&nbsp;
  <a href="ARCHITECTURE.md"><b>🏛 Architecture</b></a> &nbsp;·&nbsp;
  <a href="PRODUCT.md"><b>📦 Product</b></a>
</p>

<p align="center">
  <a href="https://github.com/durga710/helixstudio/actions/workflows/ci.yml"><img src="https://github.com/durga710/helixstudio/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <img src="https://img.shields.io/badge/license-Proprietary-1d2940" alt="License: Proprietary"/>
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16"/>
  <img src="https://img.shields.io/badge/React-19-149eca?logo=react" alt="React 19"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/deploys%20on-Vercel-000?logo=vercel" alt="Vercel"/>
</p>

---

## Overview

**Helix Studio** is a full AI software-engineering platform in the class of Cursor,
Windsurf, and Claude Code — but built around a **multi-agent pipeline** instead of a
single assistant. Connect a repository and Helix indexes it, plans a change, writes
the code, reviews it, audits it for security and performance, and ships it — each
step handled by a specialist agent that confirms its work before the next begins.

> Try the live, autoplaying product demo on the homepage → **[helixstudio.org](https://helixstudio.org)**

## Features

| | Capability | What it does |
|---|---|---|
| 🧠 | **Repository intelligence** | Indexes and embeds your whole repo on connect, then maps architecture, data flow, and dependencies. |
| 🤖 | **Multi-agent pipeline** | Planner → Repository Analyzer → Architect → Engineer → Reviewer → Security → Performance, each confirming before acting. |
| ✍️ | **Code generation & editing** | Repo-aware generation and safe, reviewable diffs in a real editor — file tree, tabs, syntax highlighting. |
| 🧾 | **Line-by-line intent ledger** | Every generated line links back to the request, plan step, agent reasoning, and the tests that protect it. |
| ↩️ | **Intentional undo** | Reverse an idea, not a commit — remove a feature and keep everything built after it. |
| 🛡 | **Self-verifying agent** | Plan → Build → Verify: runs your build and tests in a sandbox and fixes errors before handing work back. |
| 🚀 | **One-click deploy** | Build, test, security-scan, and deploy to a live edge runtime with logs, status, and rollback. |
| 🧩 | **24 built-in skills** | Opinionated engineering skills — TDD, security hardening, performance — invoked on demand. |

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| Styling | Tailwind CSS v4 · Framer Motion |
| Database | PostgreSQL · Prisma 7 |
| Auth | Auth.js (NextAuth v5) |
| AI | Anthropic · OpenAI (model-routed) |
| Runtime / deploy | Vercel · Vercel Sandbox |
| Observability | Sentry |

## Getting started

> **Prerequisites:** Node.js 20+, npm, and a PostgreSQL database (optional — Helix
> runs in a seeded demo mode without `DATABASE_URL`).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local      # then fill in the values you need

# 3. Set up the database (skip for demo mode)
npx prisma generate
npx prisma migrate deploy

# 4. Run the dev server
npm run dev                     # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint with ESLint |

## Project structure

```text
src/
├── app/                  # Next.js App Router — routes, layouts, API handlers
│   ├── welcome/          # Public marketing landing page
│   ├── (app)/            # Authenticated product surface (editor, deployments, …)
│   └── api/              # Route handlers (ai, deploy, repos, billing, …)
├── components/
│   ├── demo/             # Live hero simulation engine (terminal, agents, streaming)
│   ├── marketing/        # Landing-page sections
│   ├── studio/           # The editor / workspace UI
│   └── ui/               # Shared primitives
└── lib/                  # ai, git, deploy, repo, security, runner, …
prisma/                   # Schema and migrations
skills/                   # 24 bundled agent skills (MIT)
```

## The agent pipeline

```text
User request
   │
   ▼
Planner ─▶ Repository Analyzer ─▶ Architect ─▶ Engineer ─▶ Reviewer ─▶ Security ─▶ Performance
   │                                                                                   │
   └───────────────────────────────────  reviewed, verified output  ◀─────────────────┘
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full system design and
[`TASKS.md`](TASKS.md) for the phased roadmap.

## Contributing

Issues and pull requests are welcome — please read
[`CONTRIBUTING.md`](CONTRIBUTING.md) first. By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? Please **do not** open a public issue — follow the
disclosure process in [`SECURITY.md`](SECURITY.md).

## License

Product code is **© 2026 Helix Studio — all rights reserved** (see [`LICENSE`](LICENSE)).
The bundled agent skills in [`skills/`](skills/) are MIT-licensed (see `skills/LICENSE`).

<p align="center"><sub>Built with Helix Studio · <a href="https://helixstudio.org">helixstudio.org</a></sub></p>
