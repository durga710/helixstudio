import type {
  ActivityItem,
  AgentInfo,
  AnalysisReport,
  AuditEvent,
  DeployEnvironment,
  DeploymentRecord,
  FileNode,
  MemoryEntry,
  Project,
  SourceFile,
  TeamInvite,
  TeamMember,
  WorkspaceStats,
} from "./types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);

export const seedProjects: Project[] = [
  {
    id: "acme-web",
    name: "acme-web",
    repoUrl: "github.com/acme/web",
    description: "Multi-tenant SaaS dashboard. Next.js · Prisma · PostgreSQL.",
    language: "TypeScript",
    files: 1284,
    progress: 94,
    health: "healthy",
    indexedAt: minutesAgo(2),
  },
  {
    id: "design-system",
    name: "design-system",
    repoUrl: "github.com/acme/design-system",
    description: "Shared component library. Design tokens + 80+ React components.",
    language: "React",
    files: 412,
    progress: 61,
    health: "review",
    indexedAt: hoursAgo(3),
  },
  {
    id: "api-gateway",
    name: "api-gateway",
    repoUrl: "github.com/acme/api-gateway",
    description: "Edge API gateway. Rate limiting, auth, and request routing.",
    language: "Node",
    files: 209,
    progress: 38,
    health: "issues",
    indexedAt: daysAgo(1),
  },
];

export const seedStats: WorkspaceStats = {
  repositories: 3,
  tasksReady: 5,
  coverage: 94,
  securityFindings: 2,
};

export const seedActivity: ActivityItem[] = [
  {
    id: "a1",
    kind: "merged",
    text: "Reviewer agent approved",
    highlight: "team invitations flow",
    at: minutesAgo(2),
  },
  {
    id: "a2",
    kind: "task",
    text: "Engineer agent scaffolded",
    highlight: "team invite + join-code flow",
    at: minutesAgo(18),
  },
  {
    id: "a3",
    kind: "review",
    text: "Security agent flagged a missing auth check in",
    highlight: "/api/exports",
    at: hoursAgo(1),
  },
  {
    id: "a4",
    kind: "analysis",
    text: "Repository scan completed for",
    highlight: "design-system",
    at: hoursAgo(3),
  },
];

export const seedAnalysis: AnalysisReport = {
  projectId: "acme-web",
  scanSeconds: 4.2,
  files: 1284,
  lastCommit: minutesAgo(2),
  overview: [
    { k: "Purpose", v: "Multi-tenant SaaS dashboard" },
    { k: "Architecture", v: "Next.js App Router · API routes · Prisma" },
    { k: "Database", v: "PostgreSQL (multi-tenant by org)" },
    { k: "Auth", v: "Auth.js · email + OAuth" },
    { k: "Entry points", v: "app/layout.tsx · app/api/*" },
  ],
  dataFlow: ["Web client", "/api/orders", "Business logic", "PostgreSQL"],
  dependencies: [
    { name: "next", version: "15.2.0", status: "ok" },
    { name: "@prisma/client", version: "6.4.1", status: "ok" },
    { name: "next-auth", version: "5.0.0-beta", status: "warn" },
    { name: "tailwindcss", version: "3.4.0", status: "ok" },
    { name: "zod", version: "3.23.0", status: "ok" },
  ],
  risks: [
    {
      id: "r1",
      title: "Missing authorization check",
      detail:
        "/api/exports/[id] downloads aren't scoped to the requesting org — a tenant could read another tenant's exports.",
      severity: "high",
      kind: "security",
    },
    {
      id: "r2",
      title: "N+1 query on orders dashboard",
      detail: "OrderTable loads the customer per-row. Suggest a single include on the orders query.",
      severity: "medium",
      kind: "performance",
    },
    {
      id: "r3",
      title: "Pre-release dependency",
      detail: "next-auth@5.0.0-beta pinned in production. Track for breaking changes before GA.",
      severity: "medium",
      kind: "dependency",
    },
  ],
};

export const seedEnvironments: DeployEnvironment[] = [
  {
    id: "prod",
    name: "Production",
    url: "app.acme.dev",
    state: "ready",
    commit: "a1f9c2e",
    deployedAt: hoursAgo(2),
    region: "iad1 · us-east",
  },
  {
    id: "preview",
    name: "Preview",
    url: "team-invites-acme.vercel.app",
    state: "building",
    commit: "7d3e0b1",
    branch: "feat/team-invites",
    deployedAt: minutesAgo(1),
  },
  {
    id: "staging",
    name: "Staging",
    url: "staging.acme.dev",
    state: "ready",
    commit: "c5b8a44",
    deployedAt: daysAgo(1),
    coverage: 94,
  },
];

export const seedDeployments: DeploymentRecord[] = [
  { id: "d1", sha: "7d3e0b1", message: "feat: team invitations", author: "Engineer agent", state: "building", at: minutesAgo(1) },
  { id: "d2", sha: "a1f9c2e", message: "fix: scope export download to tenant", author: "durga", state: "ready", at: hoursAgo(2) },
  { id: "d3", sha: "c5b8a44", message: "feat: bulk actions on orders table", author: "durga", state: "ready", at: daysAgo(1) },
  { id: "d4", sha: "9b1d77a", message: "chore: bump prisma — migration failed", author: "durga", state: "failed", at: daysAgo(2) },
];

export const seedMemory: MemoryEntry[] = [
  {
    id: "m1",
    scope: "user",
    title: "Prefers plan-first responses",
    content: "Always present an implementation plan and wait for confirmation before running migrations.",
    updatedAt: daysAgo(3),
  },
  {
    id: "m2",
    scope: "project",
    title: "Invite tokens over JWT",
    content: "acme-web: chose invite-token table over JWT-only invites — supports revocation. Join codes stored hashed.",
    updatedAt: hoursAgo(5),
  },
  {
    id: "m3",
    scope: "project",
    title: "Tenant scoping rule",
    content: "Every Prisma query on shared tables must filter by orgId from the session — enforced in review.",
    updatedAt: daysAgo(1),
  },
  {
    id: "m4",
    scope: "agent",
    title: "Task: team invitations",
    content: "Engineer scaffolded invite flow (createInvite, revokeInvite, email + join code). Reviewer flagged copy-link expiry.",
    updatedAt: minutesAgo(18),
  },
];

export const seedMembers: TeamMember[] = [
  { id: "u1", name: "Durga", email: "reyghim1093@gmail.com", role: "OWNER", joinedAt: daysAgo(120) },
  { id: "u2", name: "Asha Rao", email: "asha@acme.dev", role: "ADMIN", joinedAt: daysAgo(80) },
  { id: "u3", name: "Leo Park", email: "leo@acme.dev", role: "MEMBER", joinedAt: daysAgo(30) },
];

export const seedInvites: TeamInvite[] = [
  { id: "i1", email: "mira@acme.dev", code: "HX4Q-9KTM", status: "PENDING", createdAt: hoursAgo(4) },
];

export const seedAudit: AuditEvent[] = [
  { id: "e1", actor: "Reviewer agent", action: "approved diff", target: "team invitations flow", at: minutesAgo(2) },
  { id: "e2", actor: "durga", action: "deployed", target: "production a1f9c2e", at: hoursAgo(2) },
  { id: "e3", actor: "Security agent", action: "flagged finding", target: "/api/exports/[id]", at: hoursAgo(1) },
  { id: "e4", actor: "durga", action: "invited member", target: "mira@acme.dev", at: hoursAgo(4) },
  { id: "e5", actor: "Asha Rao", action: "changed role", target: "leo@acme.dev → MEMBER", at: daysAgo(30) },
];

export const seedAgents: AgentInfo[] = [
  {
    id: "architect",
    name: "Architect",
    role: "Designs the solution & trade-offs",
    notes: [
      "Chose invite-token table over JWT-only — supports revoke.",
      "Join code stored hashed; compared on accept.",
    ],
  },
  {
    id: "engineer",
    name: "Engineer",
    role: "Builds production code",
    notes: ["Add Invite model + migration.", "Write createInvite / revokeInvite + email."],
  },
  {
    id: "reviewer",
    name: "Reviewer",
    role: "Finds logic & type errors",
    notes: ["Verify token expiry handling.", "Flag: copy-link should expire with the invite."],
  },
  {
    id: "security",
    name: "Security Auditor",
    role: "Finds vulnerabilities",
    notes: ["Scan diff for auth, injection, secret leaks."],
  },
  {
    id: "performance",
    name: "Performance Engineer",
    role: "Optimizes queries & render",
    notes: ["Check query plans and render cost."],
  },
];

/* ---------------- Editor workspace (sample acme-web checkout) ---------------- */

export const seedTree: FileNode[] = [
  {
    type: "folder",
    name: "app",
    path: "app",
    children: [
      {
        type: "folder",
        name: "api",
        path: "app/api",
        children: [
          { type: "file", name: "auth.ts", path: "app/api/auth.ts" },
          { type: "file", name: "orders.ts", path: "app/api/orders.ts", change: "M" },
          { type: "file", name: "invites.ts", path: "app/api/invites.ts", change: "A" },
        ],
      },
      {
        type: "folder",
        name: "components",
        path: "app/components",
        children: [
          { type: "file", name: "InviteCard.tsx", path: "app/components/InviteCard.tsx", change: "A" },
          { type: "file", name: "DataTable.tsx", path: "app/components/DataTable.tsx" },
        ],
      },
    ],
  },
  {
    type: "folder",
    name: "prisma",
    path: "prisma",
    children: [{ type: "file", name: "schema.prisma", path: "prisma/schema.prisma" }],
  },
  { type: "file", name: "CLAUDE.md", path: "CLAUDE.md" },
  { type: "file", name: "ARCHITECTURE.md", path: "ARCHITECTURE.md" },
  { type: "file", name: "TASKS.md", path: "TASKS.md" },
];

export const seedFiles: SourceFile[] = [
  {
    path: "app/api/invites.ts",
    language: "TypeScript",
    content: `// Team invitations — emailed invite + single-use join code
import { prisma } from '@/lib/db'
import { sendInviteEmail } from '@/lib/mail'
import { randomCode } from '@/lib/crypto'

export async function createInvite(orgId: string, email: string) {
  const code = randomCode(8)
  const invite = await prisma.invite.create({
    data: { orgId, email, code, status: 'PENDING' },
  })
  await sendInviteEmail(email, { code, inviteId: invite.id })
  return invite
}

// Admin controls: resend · revoke · copy-link
export async function revokeInvite(id: string) {
  return prisma.invite.update({ where: { id }, data: { status: 'REVOKED' } })
}
`,
  },
  {
    path: "app/api/orders.ts",
    language: "TypeScript",
    content: `// Orders API — list, with tenant scoping
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export async function listOrders(req: Request) {
  const session = await auth(req)
  return prisma.order.findMany({
    where: { orgId: session.orgId },
    include: { customer: true },   // avoids N+1
    orderBy: { createdAt: 'desc' },
  })
}
`,
  },
  {
    path: "app/api/auth.ts",
    language: "TypeScript",
    content: `// Session helper — resolves the org-scoped session or throws 401
import { getServerSession } from '@/lib/session'

export async function auth(req: Request) {
  const session = await getServerSession(req)
  if (!session) throw new Response('Unauthorized', { status: 401 })
  return session
}
`,
  },
  {
    path: "app/components/InviteCard.tsx",
    language: "TSX",
    content: `// Pending invite row with admin controls
import { resendInvite, revokeInvite } from '@/app/api/invites'

export function InviteCard({ invite }: { invite: Invite }) {
  return (
    <div className="invite-card" role="listitem">
      <span>{invite.email}</span>
      <code>{invite.code}</code>
      <button onClick={() => resendInvite(invite.id)}>Resend</button>
      <button onClick={() => revokeInvite(invite.id)}>Revoke</button>
    </div>
  )
}
`,
  },
  {
    path: "app/components/DataTable.tsx",
    language: "TSX",
    content: `// Generic, accessible data table
import { useState } from 'react'

export function DataTable<T>({ rows, columns }: Props<T>) {
  const [sort, setSort] = useState<SortState>()
  return (
    <table role="grid" className="w-full">
      {/* header + virtualized rows */}
    </table>
  )
}
`,
  },
  {
    path: "prisma/schema.prisma",
    language: "Prisma",
    content: `model Invite {
  id        String       @id @default(cuid())
  orgId     String
  email     String
  code      String       @unique
  status    InviteStatus @default(PENDING)
  createdAt DateTime     @default(now())
}

enum InviteStatus {
  PENDING
  ACCEPTED
  REVOKED
}
`,
  },
  {
    path: "CLAUDE.md",
    language: "Markdown",
    content: `# acme-web

Multi-tenant SaaS dashboard. Every query on shared tables must be scoped by orgId.
`,
  },
  {
    path: "ARCHITECTURE.md",
    language: "Markdown",
    content: `# Architecture

Next.js App Router · API routes · Prisma · PostgreSQL (multi-tenant by org).
`,
  },
  {
    path: "TASKS.md",
    language: "Markdown",
    content: `# Tasks

- [x] Invite model + migration
- [ ] Admin resend / revoke / copy-link
- [ ] Acceptance flow (/accept/[token])
`,
  },
];
