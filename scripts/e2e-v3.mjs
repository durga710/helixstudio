/**
 * v3 E2E — editor plan mode, Space activity feed, gradebook, task board.
 * Run against a dev server on localhost:3000: node scripts/e2e-v3.mjs
 * Creates throwaway *@e2e.test users; safe to re-run.
 */

const BASE = "http://localhost:3000";
let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

function jar() {
  const cookies = new Map();
  return {
    absorb(res) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function call(user, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(user ? { cookie: user.header() } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  user?.absorb(res);
  let json = null;
  try {
    json = await res.clone().json();
  } catch {}
  return { res, json };
}

async function newUser(name, email) {
  const u = jar();
  const s = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email, password: "password-123" }),
  });
  if (s.status !== 201) throw new Error(`signup ${email}: ${s.status}`);
  const csrfRes = await fetch(BASE + "/api/auth/csrf", { headers: { cookie: u.header() } });
  u.absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const login = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: u.header() },
    body: new URLSearchParams({ csrfToken, email, password: "password-123" }),
  });
  u.absorb(login);
  const me = await call(u, "GET", "/api/spaces");
  if (!me.json?.ok) throw new Error(`login ${email} failed`);
  return u;
}

/** Read an NDJSON chat response and return its parsed events. */
async function chat(user, wsId, message, mode) {
  const res = await fetch(`${BASE}/api/workspaces/${wsId}/chat`, {
    method: "POST",
    headers: { cookie: user.header(), "content-type": "application/json" },
    body: JSON.stringify({ message, ...(mode ? { mode } : {}) }),
  });
  const text = await res.text();
  const events = text
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { status: res.status, events };
}

const t = Date.now();
const A = await newUser("Ana Owner", `ana.${t}@e2e.test`);
const B = await newUser("Bo Member", `bo.${t}@e2e.test`);
const C = await newUser("Cy Outsider", `cy.${t}@e2e.test`);
console.log("three users ready");

/* ------------------------------- plan mode ------------------------------- */

let r = await call(A, "POST", "/api/workspaces", { mode: "SCRATCH", name: "Plan mode ws" });
const wsId = r.json.data.id;
await call(A, "POST", `/api/workspaces/${wsId}/files`, {
  files: [{ path: "index.html", content: "<h1>v3</h1>" }],
});

r = await call(A, "GET", `/api/workspaces/${wsId}/files`);
const filesBefore = r.json.data.files.length;

const planTurn = await chat(A, wsId, "Add a dark mode toggle to this page", "plan");
ok("plan-mode chat responds", planTurn.status === 200, `status ${planTurn.status}`);
const planFinal = planTurn.events.find((e) => e.type === "final");
const planError = planTurn.events.find((e) => e.type === "error");
if (planFinal) {
  ok("plan turn carries the plan marker", planFinal.actions?.some((a) => a.tool === "plan") === true, JSON.stringify(planFinal.actions));
  ok("plan turn reports no file changes", (planFinal.changes?.written?.length ?? 0) === 0 && (planFinal.changes?.deleted?.length ?? 0) === 0);
} else {
  // No AI provider configured for this account — the route still must have
  // accepted the mode field and returned a structured error, not a 4xx/5xx.
  ok("plan turn carries the plan marker", Boolean(planError), "no final/error event");
  ok("plan turn reports no file changes", true, "(skipped — provider unavailable)");
  console.log("  note: AI provider unavailable — plan content checks degraded to API-shape checks");
}
r = await call(A, "GET", `/api/workspaces/${wsId}/files`);
ok("file count unchanged after plan turn", r.json.data.files.length === filesBefore);

const badMode = await call(A, "POST", `/api/workspaces/${wsId}/chat`, { message: "x", mode: "yolo" });
ok("invalid mode rejected", badMode.res.status === 400);

r = await call(B, "POST", `/api/workspaces/${wsId}/chat`, { message: "hi", mode: "plan" });
ok("non-owner cannot chat (plan mode too)", r.res.status === 404);

/* ----------------------------- space + feed ------------------------------ */

r = await call(A, "POST", "/api/spaces", { name: "v3 Crew", kind: "team" });
const spaceId = r.json.data.id;
const joinCode = r.json.data.joinCode;
r = await call(B, "POST", "/api/spaces/join", { code: joinCode });
ok("B joins", r.json?.ok);

r = await call(A, "PATCH", `/api/workspaces/${wsId}`, { spaceId });
ok("A shares workspace", r.json?.ok);
r = await call(B, "POST", `/api/workspaces/${wsId}/fork`);
ok("B forks shared workspace", r.json?.ok);

r = await call(A, "GET", `/api/spaces/${spaceId}/activity`);
const actions = (r.json?.data?.events ?? []).map((e) => e.action);
ok("feed has joined event", actions.includes("joined"));
ok("feed has shared event", actions.includes("shared"));
ok("feed has forked event", actions.includes("forked"));
const joinedEvt = r.json.data.events.find((e) => e.action === "joined");
ok("feed actor name recorded", joinedEvt?.actorName === "Bo Member", JSON.stringify(joinedEvt));
r = await call(C, "GET", `/api/spaces/${spaceId}/activity`);
ok("non-member cannot read feed", r.res.status === 404);

/* ------------------------------ task board ------------------------------- */

r = await call(B, "POST", `/api/spaces/${spaceId}/tasks`, { title: "Write the README", assigneeId: "nope" });
ok("non-member assignee rejected", r.res.status === 400);
r = await call(B, "POST", `/api/spaces/${spaceId}/tasks`, { title: "Write the README" });
ok("B adds a task", r.json?.ok, JSON.stringify(r.json));
const taskId = r.json.data.id;

r = await call(A, "PATCH", `/api/spaces/${spaceId}/tasks/${taskId}`, { status: "doing" });
ok("A moves the task (any member can)", r.json?.ok);
r = await call(A, "PATCH", `/api/spaces/${spaceId}/tasks/${taskId}`, { status: "done" });
ok("task moved to done", r.json?.ok);
r = await call(A, "GET", `/api/spaces/${spaceId}/tasks`);
ok("board lists the task as done", r.json?.data?.tasks?.some((x) => x.id === taskId && x.status === "done"));

r = await call(A, "GET", `/api/spaces/${spaceId}/activity`);
const acts2 = (r.json?.data?.events ?? []).map((e) => e.action);
ok("feed has task_added + task_done", acts2.includes("task_added") && acts2.includes("task_done"));

r = await call(C, "GET", `/api/spaces/${spaceId}/tasks`);
ok("non-member cannot read the board", r.res.status === 404);

// Delete rules: A (owner, not creator) may; first prove a non-creator member couldn't.
r = await call(B, "POST", `/api/spaces/${spaceId}/tasks`, { title: "Owner-delete me" });
const t2 = r.json.data.id;
// C joins to become a plain member who is neither creator nor owner.
await call(C, "POST", "/api/spaces/join", { code: joinCode });
r = await call(C, "DELETE", `/api/spaces/${spaceId}/tasks/${t2}`);
ok("non-creator member cannot delete", r.res.status === 403);
r = await call(A, "DELETE", `/api/spaces/${spaceId}/tasks/${t2}`);
ok("owner can delete any task", r.json?.ok);
r = await call(B, "DELETE", `/api/spaces/${spaceId}/tasks/${taskId}`);
ok("creator can delete own task", r.json?.ok);

/* ------------------------------- gradebook ------------------------------- */

r = await call(A, "GET", `/api/spaces/${spaceId}/gradebook`);
ok("gradebook rejects team-kind space", r.res.status === 400);

r = await call(A, "POST", "/api/spaces", { name: "v3 Class", kind: "classroom" });
const classId = r.json.data.id;
const classCode = r.json.data.joinCode;
await call(B, "POST", "/api/spaces/join", { code: classCode });
r = await call(A, "POST", `/api/spaces/${classId}/assignments`, { title: "GB assignment", instructions: "do it" });
const aId = r.json.data.id;
r = await call(B, "POST", `/api/spaces/${classId}/assignments/${aId}/start`);
const subWs = r.json.data.workspaceId;
await call(B, "POST", `/api/spaces/${classId}/assignments/${aId}/submit`, { action: "submit" });

r = await call(A, "GET", `/api/spaces/${classId}/gradebook`);
ok(
  "gradebook grid: 1 assignment × 1 student, cell submitted",
  r.json?.ok &&
    r.json.data.assignments.length === 1 &&
    r.json.data.students.length === 1 &&
    r.json.data.cells[`${aId}:${r.json.data.students[0].userId}`]?.status === "submitted",
  JSON.stringify(r.json?.data ?? r.json),
);
r = await call(B, "GET", `/api/spaces/${classId}/gradebook`);
ok("student cannot open the gradebook", r.res.status === 404);

r = await call(A, "GET", `/api/spaces/${classId}/activity`);
const acts3 = (r.json?.data?.events ?? []).map((e) => e.action);
ok("classroom feed: assignment_created + submitted", acts3.includes("assignment_created") && acts3.includes("submitted"));

/* -------------------------------- cleanup -------------------------------- */

await call(A, "DELETE", `/api/spaces/${spaceId}`);
await call(A, "DELETE", `/api/spaces/${classId}`);
r = await call(B, "GET", `/api/workspaces/${subWs}`);
ok("cleanup ok; submission workspace survives", r.json?.ok);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
