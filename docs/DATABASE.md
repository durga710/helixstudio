# Database

Helix Studio runs in two modes:

## Demo mode (default)

Without `DATABASE_URL`, the app uses a seeded in-memory store
(`src/lib/store.ts`). Every feature works — projects, chat,
agents, memory, deployments, team — but data resets when the server restarts.
This is what runs on a fresh deploy of helixstudio.org until a database is
attached.

## PostgreSQL mode

`prisma/schema.prisma` models every entity across the roadmap
phases:

| Phase | Models |
|-------|--------|
| 1 — Foundation | `User`, `Account`, `Session` (Auth.js), `Project`, `ChatThread`, `ChatMessage` |
| 2 — Repository intelligence | `RepoFile`, `RepoChunk` (Qdrant vector ref), `Analysis` |
| 3 — Agents | `AgentRun`, `AgentStep` (incl. `AWAITING_CONFIRMATION` for action gating) |
| 5 — Memory | `MemoryEntry` (user / project / agent scopes) |
| 6 — Deployments | `Deployment` |
| 7 — Enterprise | `Team`, `TeamMember` (RBAC roles), `Invite` (hashed join codes), `AuditEvent` |

### Setup

```bash
# from the repo root:
# point DATABASE_URL at PostgreSQL in .env, then:
npx prisma migrate dev --name init
npx prisma generate
```

### Swap point

API routes talk to the data layer through `src/lib/store.ts`. To move to
PostgreSQL, replace the in-memory implementations there with Prisma queries —
route handlers and screens don't change. Security invariants to preserve from
the schema:

- Invite join codes are stored **hashed** (`Invite.codeHash`) and compared in
  constant time on accept.
- Every team-scoped query filters by `teamId` from the session (multi-tenant
  scoping — also enforced in review by the Security agent).
- `AuditEvent` rows are append-only.
