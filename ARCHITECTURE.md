# Helix Studio — Architecture

## High-level stack

**Frontend:** Next.js (App Router) · TypeScript · TailwindCSS · shadcn/ui
**Backend:** Node.js · Next.js API routes / route handlers
**Database:** PostgreSQL · Prisma
**Auth:** Auth.js
**Vector store:** Qdrant (repository embeddings)
**Hosting:** Vercel
**AI providers:** Anthropic · OpenAI · Google (model routing)
**Observability:** OpenTelemetry

## Core services

### User service
Authentication, profiles, workspace settings (theme, accent, density, model defaults).

### AI service
Model routing, prompt assembly, agent orchestration, streaming responses.

### Memory service
Project memory and conversation memory.

### Repository service
Indexing, embeddings, semantic search, static analysis.

### Terminal service
Sandboxed command execution.

### Deployment service
Deploy orchestration, build logs, environment status.

## Agent pipeline

```
User request
  → Planner
  → Repository analyzer
  → Architect
  → Engineer
  → Reviewer
  → Security auditor
  → Performance engineer
  → Final output
```

Each stage confirms before taking an action that writes files or runs migrations.

## Scalability

Stateless API layer · cached embeddings · background workers · queue processing · horizontal scaling.

## Data flow (example: a feature request)

```
Chat input → AI service (plan) → user confirm → Engineer writes diff
  → Reviewer + Security + Performance scan → user accepts → commit → deploy
```
