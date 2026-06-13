import "server-only";

/**
 * Seeds a realistic, fully-populated set of REAL database rows for a test
 * account (and a few supporting users) so every page in the app lights up with
 * believable data — for demos and manual testing. This is the opposite of
 * smoke/demo data: it writes actual rows the same queries the app uses will
 * read back.
 *
 * Idempotent by design: every run first wipes the seed users (matched by an
 * exact, collision-proof email allowlist) and rebuilds. FK CASCADE makes the
 * wipe a complete, clean teardown. Real users are never matched, so this is
 * safe to run against the production database from the admin panel.
 */

import { randomBytes } from "node:crypto";
import { db, schemaReady } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const SEED_DOMAIN = "seed.helix.test";
export const TEST_USER_EMAIL = `durga@${SEED_DOMAIN}`;
export const TEST_USER_PASSWORD = "helix-seed-2026";
const TEAMMATE_EMAIL = `aanya@${SEED_DOMAIN}`;
const STUDENT_EMAILS = [`sam@${SEED_DOMAIN}`, `mei@${SEED_DOMAIN}`, `leo@${SEED_DOMAIN}`];
const ALL_SEED_EMAILS = [TEST_USER_EMAIL, TEAMMATE_EMAIL, ...STUDENT_EMAILS];

export interface SeedSummary {
  testUser: { email: string; password: string };
  counts: Record<string, number>;
}

const DAY = 24 * 60 * 60 * 1000;
/** A Date `n` days ago (server-side; the Date.now lint rule is React-only). */
function daysAgo(n: number, jitterHours = 0): Date {
  return new Date(Date.now() - n * DAY - jitterHours * 60 * 60 * 1000);
}
function joinCode(): string {
  return randomBytes(9).toString("base64url");
}
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

/**
 * Deletes every seed user by exact email match. CASCADE removes the entire
 * downstream graph (workspaces, files, messages, intents/changes, tasks,
 * deploys, usage; owned spaces → assignments/submissions/members/events/tasks;
 * deploy connections; preferences). Real accounts are never in ALL_SEED_EMAILS.
 */
export async function wipeTestData(): Promise<{ deletedUsers: number }> {
  await schemaReady();
  const res = await db().user.deleteMany({ where: { email: { in: ALL_SEED_EMAILS } } });
  return { deletedUsers: res.count };
}

export async function seedTestData(): Promise<SeedSummary> {
  await schemaReady();
  await wipeTestData(); // clean slate → re-runnable, never trips unique constraints

  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => {
    counts[k] = (counts[k] ?? 0) + n;
  };

  // ── Users ────────────────────────────────────────────────────────────────
  const primary = await db().user.create({
    data: {
      email: TEST_USER_EMAIL,
      name: "Durga (test)",
      passwordHash: hashPassword(TEST_USER_PASSWORD),
      tier: "pro",
      tokensUsed: 418_500,
      periodTokens: 84_200,
      periodStart: new Date(),
      createdAt: daysAgo(45),
      preferences: {
        create: {
          aiProvider: "anthropic",
          aiModel: "claude-sonnet-4-6",
          // Keys intentionally null — a fake key could be sent to a provider.
          // Tier + counters make Settings/usage look populated without one.
        },
      },
    },
  });
  bump("users");

  const teammate = await db().user.create({
    data: {
      email: TEAMMATE_EMAIL,
      name: "Aanya (test)",
      passwordHash: hashPassword(TEST_USER_PASSWORD),
      tier: "free",
      tokensUsed: 32_000,
      createdAt: daysAgo(30),
    },
  });
  bump("users");

  const students = [];
  const studentNames = ["Sam", "Mei", "Leo"];
  for (let i = 0; i < STUDENT_EMAILS.length; i++) {
    const s = await db().user.create({
      data: {
        email: STUDENT_EMAILS[i],
        name: `${studentNames[i]} (test)`,
        passwordHash: hashPassword(TEST_USER_PASSWORD),
        tier: "free",
        tokensUsed: 4_000 + i * 1_500,
        createdAt: daysAgo(20 - i),
      },
    });
    students.push(s);
    bump("users");
  }

  // ── Primary user's workspaces (files, chat, intent ledger, tasks) ─────────
  const wsSpecs = [
    {
      name: "landing-page",
      mode: "SCRATCH" as const,
      repo: null as string | null,
      files: [
        { path: "package.json", content: `{\n  "name": "landing-page",\n  "private": true,\n  "scripts": { "dev": "next dev", "build": "next build" }\n}\n` },
        { path: "app/page.tsx", content: `export default function Home() {\n  return <main className="p-10 text-2xl font-bold">Hello from Helix</main>;\n}\n` },
        { path: "README.md", content: `# landing-page\n\nMarketing site scaffolded in Helix Studio.\n` },
      ],
    },
    {
      name: "helix-demo",
      mode: "IMPORT" as const,
      repo: "durga/helix-demo",
      files: [
        { path: "src/index.ts", content: `export const greet = (name: string) => \`Hi \${name}\`;\n` },
        { path: "src/util.ts", content: `export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));\n` },
      ],
    },
    {
      name: "api-service",
      mode: "SCRATCH" as const,
      repo: null,
      files: [
        { path: "server.ts", content: `import http from "node:http";\nhttp.createServer((_, res) => res.end("ok")).listen(3000);\n` },
        { path: "package.json", content: `{\n  "name": "api-service",\n  "scripts": { "build": "tsc -p .", "test": "node --test" }\n}\n` },
      ],
    },
  ];

  for (let w = 0; w < wsSpecs.length; w++) {
    const spec = wsSpecs[w];
    const ws = await db().workspace.create({
      data: {
        userId: primary.id,
        name: spec.name,
        mode: spec.mode,
        provider: "github",
        repo: spec.repo,
        baseBranch: spec.mode === "IMPORT" ? "main" : null,
        createdAt: daysAgo(40 - w * 6),
        files: { create: spec.files.map((f) => ({ path: f.path, content: f.content })) },
        messages: {
          create: [
            { role: "user", content: `Set up the ${spec.name} project and a basic entry point.`, createdAt: daysAgo(40 - w * 6, 2) },
            {
              role: "assistant",
              content: `Done — scaffolded ${spec.name} with ${spec.files.length} files and a working entry point.`,
              actions: [{ tool: "write_file", label: `wrote ${spec.files[0].path}` }],
              createdAt: daysAgo(40 - w * 6, 1),
            },
            { role: "user", content: "Add a README and tidy the structure.", createdAt: daysAgo(38 - w * 6) },
            { role: "assistant", content: "Added a README and split utilities into their own module.", createdAt: daysAgo(38 - w * 6, -1) },
          ],
        },
        tasks: {
          create: [
            { prompt: "Run the build and fix any errors", status: pick(["done", "running", "queued"], w), resultText: w === 0 ? "Build passed." : null, createdAt: daysAgo(37 - w * 6) },
          ],
        },
      },
    });
    bump("workspaces");
    bump("files", spec.files.length);
    bump("messages", 4);
    bump("tasks");

    // Intent ledger: one agent intent + one manual intent per workspace.
    await db().workspaceIntent.create({
      data: {
        workspaceId: ws.id,
        kind: "agent",
        status: "final",
        title: `Scaffold ${spec.name}`,
        userRequest: `Set up the ${spec.name} project and a basic entry point.`,
        reasoning: `Created the project structure with ${spec.files.length} files.`,
        createdAt: daysAgo(40 - w * 6, 1),
        changes: {
          create: spec.files.map((f) => ({
            workspaceId: ws.id,
            path: f.path,
            beforeContent: null,
            afterContent: f.content,
          })),
        },
      },
    });
    bump("intents");
    bump("changes", spec.files.length);

    await db().workspaceIntent.create({
      data: {
        workspaceId: ws.id,
        kind: "manual",
        status: "final",
        title: "Tweak entry point",
        createdAt: daysAgo(38 - w * 6),
        changes: {
          create: [
            {
              workspaceId: ws.id,
              path: spec.files[0].path,
              beforeContent: spec.files[0].content,
              afterContent: spec.files[0].content + "\n// edited\n",
            },
          ],
        },
      },
    });
    bump("intents");
    bump("changes");
  }

  // ── Deploy-demo workspaces (one WorkspaceDeploy each — UNIQUE per ws) ──────
  const deploySpecs = [
    { name: "shop-frontend", provider: "vercel", state: "READY", url: "https://shop-frontend.vercel.app" },
    { name: "blog-astro", provider: "vercel", state: "BUILDING", url: "https://blog-astro.vercel.app" },
    { name: "docs-site", provider: "netlify", state: "ERROR", url: "https://docs-site.netlify.app" },
    { name: "edge-worker", provider: "vercel", state: "QUEUED", url: "https://edge-worker.vercel.app" },
    { name: "old-prototype", provider: "netlify", state: "CANCELED", url: "https://old-prototype.netlify.app" },
  ];
  for (let i = 0; i < deploySpecs.length; i++) {
    const d = deploySpecs[i];
    const ws = await db().workspace.create({
      data: {
        userId: primary.id,
        name: d.name,
        mode: "SCRATCH",
        provider: "github",
        createdAt: daysAgo(25 - i),
        deploy: {
          create: {
            provider: d.provider,
            projectId: `seed-${i}`, // obviously fake → live refresh skips gracefully
            projectName: d.name,
            productionUrl: d.url,
            dashboardUrl: d.provider === "vercel" ? "https://vercel.com/dashboard" : "https://app.netlify.com",
            lastState: d.state,
            lastDeployAt: daysAgo(i, i * 3),
          },
        },
      },
    });
    void ws;
    bump("workspaces");
    bump("deploys");
  }

  // ── Deploy connections (so the refresh path has something to resolve) ──────
  for (const provider of ["vercel", "netlify"]) {
    await db().deployConnection.create({
      data: { userId: primary.id, provider, token: "seed-fake-token", config: {} },
    });
    bump("connections");
  }

  // ── Classroom Space owned by the primary user ─────────────────────────────
  const classroom = await db().space.create({
    data: {
      name: "CS101 — Intro to Web",
      kind: "classroom",
      plan: "active",
      seats: 30,
      ownerId: primary.id,
      joinCode: joinCode(),
      createdAt: daysAgo(28),
      members: {
        create: [
          { userId: primary.id, role: "owner" },
          ...students.map((s) => ({ userId: s.id, role: "member" })),
        ],
      },
    },
  });
  bump("spaces");
  bump("spaceMembers", students.length + 1);

  const assignmentA = await db().assignment.create({
    data: {
      spaceId: classroom.id,
      title: "Build a responsive navbar",
      instructions: "Create a mobile-friendly navbar with a hamburger menu. Submit when done.",
      dueAt: daysAgo(-3), // due in 3 days
      createdAt: daysAgo(20),
    },
  });
  const assignmentB = await db().assignment.create({
    data: {
      spaceId: classroom.id,
      title: "Fetch and render an API list",
      instructions: "Fetch JSON from a public API and render it with loading/empty/error states.",
      dueAt: daysAgo(5), // was due 5 days ago
      createdAt: daysAgo(15),
    },
  });
  bump("assignments", 2);

  // Submissions in varied states across students × assignments.
  const subPlan = [
    { assignment: assignmentA, student: students[0], status: "reviewed", grade: "94/100", feedback: "Clean markup, great a11y.", reviewed: true },
    { assignment: assignmentA, student: students[1], status: "submitted", grade: null, feedback: null, reviewed: false },
    { assignment: assignmentA, student: students[2], status: "in_progress", grade: null, feedback: null, reviewed: false },
    { assignment: assignmentB, student: students[0], status: "reviewed", grade: "88/100", feedback: "Handle the empty state too.", reviewed: true },
    { assignment: assignmentB, student: students[1], status: "in_progress", grade: null, feedback: null, reviewed: false },
  ];
  for (const p of subPlan) {
    await db().assignmentSubmission.create({
      data: {
        assignmentId: p.assignment.id,
        userId: p.student.id,
        status: p.status,
        grade: p.grade,
        feedback: p.feedback,
        aiReview: p.reviewed ? "AI review: solid structure; consider extracting the list item into a component." : null,
        submittedAt: p.status === "in_progress" ? null : daysAgo(8),
        reviewedAt: p.reviewed ? daysAgo(6) : null,
        createdAt: daysAgo(12),
      },
    });
    bump("submissions");
  }

  // Task board.
  const boardTasks = [
    { title: "Grade navbar submissions", status: "doing", assigneeId: primary.id },
    { title: "Write assignment 3 brief", status: "todo", assigneeId: null },
    { title: "Set up the syllabus page", status: "done", assigneeId: primary.id },
    { title: "Review API-list rubric", status: "todo", assigneeId: null },
  ];
  for (let i = 0; i < boardTasks.length; i++) {
    const t = boardTasks[i];
    await db().spaceTask.create({
      data: {
        spaceId: classroom.id,
        title: t.title,
        status: t.status,
        assigneeId: t.assigneeId,
        createdById: primary.id,
        order: i,
        createdAt: daysAgo(18 - i),
      },
    });
    bump("spaceTasks");
  }

  // Activity feed.
  const events: { action: string; actor: string; target: string; userId: string | null; days: number }[] = [
    { action: "joined", actor: "Sam (test)", target: "CS101", userId: students[0].id, days: 19 },
    { action: "joined", actor: "Mei (test)", target: "CS101", userId: students[1].id, days: 18 },
    { action: "assignment_created", actor: "Durga (test)", target: "Build a responsive navbar", userId: primary.id, days: 20 },
    { action: "submitted", actor: "Sam (test)", target: "Build a responsive navbar", userId: students[0].id, days: 8 },
    { action: "reviewed", actor: "Durga (test)", target: "Build a responsive navbar", userId: primary.id, days: 6 },
    { action: "task_added", actor: "Durga (test)", target: "Write assignment 3 brief", userId: primary.id, days: 5 },
  ];
  for (const e of events) {
    await db().spaceEvent.create({
      data: { spaceId: classroom.id, userId: e.userId, actorName: e.actor, action: e.action, target: e.target, createdAt: daysAgo(e.days) },
    });
    bump("spaceEvents");
  }

  // ── Team Space owned by the teammate; primary user is a member ────────────
  const team = await db().space.create({
    data: {
      name: "Helix Core Team",
      kind: "team",
      plan: "active",
      seats: 10,
      ownerId: teammate.id,
      joinCode: joinCode(),
      createdAt: daysAgo(26),
      members: {
        create: [
          { userId: teammate.id, role: "owner" },
          { userId: primary.id, role: "member" },
        ],
      },
    },
  });
  bump("spaces");
  bump("spaceMembers", 2);

  // Workspaces the teammate shared into the team space (show up as "shared").
  for (const name of ["design-system", "infra-scripts"]) {
    await db().workspace.create({
      data: {
        userId: teammate.id,
        name,
        mode: "SCRATCH",
        provider: "github",
        spaceId: team.id,
        createdAt: daysAgo(22),
        files: { create: [{ path: "README.md", content: `# ${name}\n\nShared into the Helix Core Team space.\n` }] },
      },
    });
    bump("workspaces");
    bump("files");
  }
  await db().spaceEvent.create({
    data: { spaceId: team.id, userId: primary.id, actorName: "Durga (test)", action: "joined", target: "Helix Core Team", createdAt: daysAgo(24) },
  });
  await db().spaceEvent.create({
    data: { spaceId: team.id, userId: teammate.id, actorName: "Aanya (test)", action: "shared", target: "design-system", createdAt: daysAgo(22) },
  });
  bump("spaceEvents", 2);

  // ── AI usage events spread over the last 30 days (flat batch) ─────────────
  const kinds = ["chat", "review", "chat", "chat", "rerank"];
  const usageRows = Array.from({ length: 54 }, (_, i) => ({
    userId: primary.id,
    kind: pick(kinds, i),
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    tokens: 600 + ((i * 877) % 7200),
    createdAt: daysAgo(i % 30, (i * 7) % 24),
  }));
  await db().aiUsageEvent.createMany({ data: usageRows });
  bump("usageEvents", usageRows.length);

  return { testUser: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }, counts };
}
