/**
 * Space v2 E2E — classrooms, assignments, billing caps, webhook.
 * Run against a dev server on localhost:3000:
 *   node scripts/e2e-space-v2.mjs
 *
 * The webhook tests need the server started with fake Stripe env, e.g.
 *   STRIPE_SECRET_KEY=sk_test_fake STRIPE_WEBHOOK_SECRET=whsec_e2e_secret
 *   STRIPE_PRICE_TEAM=price_team STRIPE_PRICE_EDU=price_edu npm run dev
 * (they self-skip when billing.enabled is false). Creates throwaway
 * *@e2e.test users; safe to re-run.
 */

import { createHmac } from "node:crypto";

const BASE = "http://localhost:3000";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_e2e_secret";
let pass = 0,
  fail = 0,
  skipped = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};
const skip = (name, why) => {
  skipped++;
  console.log(`skip  ${name} (${why})`);
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

async function call(user, method, path, body, opts = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: opts.redirect ?? "follow",
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

async function signup(name, email, password) {
  const s = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (s.status !== 201) throw new Error(`signup ${email}: ${s.status}`);
}

async function login(user, email, password) {
  const csrfRes = await fetch(BASE + "/api/auth/csrf", { headers: { cookie: user.header() } });
  user.absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: user.header() },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  user.absorb(res);
  const me = await call(user, "GET", "/api/spaces");
  if (!me.json?.ok) throw new Error(`login ${email} failed: ${me.res.status}`);
}

async function newUser(name, email) {
  const u = jar();
  await signup(name, email, "password-123");
  await login(u, email, "password-123");
  return u;
}

/** Stripe-format signature over the raw body. */
function stripeSig(rawBody, secret) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function postWebhook(eventBody, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(eventBody);
  return fetch(BASE + "/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": stripeSig(raw, secret) },
    body: raw,
  });
}

const t = Date.now();
const A = await newUser("Ada Instructor", `ada.${t}@e2e.test`); // instructor
const B = await newUser("Ben Student", `ben.${t}@e2e.test`);
const C = await newUser("Cleo Student", `cleo.${t}@e2e.test`);
console.log("three users ready");

/* ------------------------- classroom + assignments ------------------------ */

let r = await call(A, "POST", "/api/spaces", { name: "CS101", kind: "classroom" });
ok("create classroom", r.json?.ok, JSON.stringify(r.json));
const classId = r.json.data.id;
const classCode = r.json.data.joinCode;

r = await call(A, "GET", `/api/spaces/${classId}`);
ok("detail has kind + billing block", r.json?.data?.kind === "classroom" && typeof r.json.data.billing?.memberCap === "number");
const billingEnabled = r.json.data.billing.enabled === true;

for (const u of [B, C]) {
  r = await call(u, "POST", "/api/spaces/join", { code: classCode });
  if (!r.json?.ok) throw new Error("student join failed");
}
console.log("  students joined");

// Starter workspace with a file.
r = await call(A, "POST", "/api/workspaces", { mode: "SCRATCH", name: "Starter code" });
const starterId = r.json.data.id;
await call(A, "POST", `/api/workspaces/${starterId}/files`, {
  files: [{ path: "main.py", content: "print('starter')" }],
});

r = await call(A, "POST", `/api/spaces/${classId}/assignments`, {
  title: "Assignment 1",
  instructions: "Extend the starter to read input.",
  starterWorkspaceId: starterId,
});
ok("create assignment with starter", r.json?.ok, JSON.stringify(r.json));
const a1 = r.json?.data?.id;

r = await call(A, "POST", `/api/spaces/${classId}/assignments`, { title: "Assignment 2", instructions: "x" });
ok("second assignment (free cap is 2)", r.json?.ok);
r = await call(A, "POST", `/api/spaces/${classId}/assignments`, { title: "Assignment 3", instructions: "x" });
ok("third assignment hits the cap → 402", r.res.status === 402 && r.json?.error?.code === "UPGRADE_REQUIRED");

r = await call(B, "POST", `/api/spaces/${classId}/assignments`, { title: "hax", instructions: "x" });
ok("student cannot create assignments", r.res.status === 404);

r = await call(A, "POST", "/api/spaces", { name: "Just a team", kind: "team" });
const teamId = r.json.data.id;
r = await call(A, "POST", `/api/spaces/${teamId}/assignments`, { title: "nope", instructions: "x" });
ok("team-kind space rejects assignments", r.res.status === 400);

/* ------------------------------ student flow ----------------------------- */

r = await call(B, "POST", `/api/spaces/${classId}/assignments/${a1}/start`);
ok("B starts assignment (starter copied)", r.json?.ok && r.json.data.fileCount === 1, JSON.stringify(r.json));
const bWs = r.json.data.workspaceId;
r = await call(B, "POST", `/api/spaces/${classId}/assignments/${a1}/start`);
ok("double-start is idempotent", r.json?.ok && r.json.data.workspaceId === bWs && r.json.data.existing === true);

r = await call(A, "POST", `/api/spaces/${classId}/assignments/${a1}/start`);
ok("instructor cannot start own assignment", r.res.status === 400);

r = await call(C, "GET", `/api/workspaces/${bWs}/files`);
ok("classmate cannot read B's submission", r.res.status === 404);
r = await call(A, "GET", `/api/workspaces/${bWs}/files`);
ok("instructor reads B's submission", r.json?.ok && r.json.data.isOwner === false);
r = await call(A, "POST", `/api/workspaces/${bWs}/files`, { files: [{ path: "evil.py", content: "x" }] });
ok("instructor cannot write to B's submission", r.res.status === 404);
r = await call(B, "GET", `/api/workspaces/${bWs}/file?path=main.py`);
ok("B's copy has the starter content", r.json?.data?.content === "print('starter')");

r = await call(B, "POST", `/api/spaces/${classId}/assignments/${a1}/submit`, { action: "submit" });
ok("B submits", r.json?.ok && r.json.data.status === "submitted");
r = await call(B, "POST", `/api/spaces/${classId}/assignments/${a1}/submit`, { action: "unsubmit" });
ok("B unsubmits", r.json?.ok && r.json.data.status === "in_progress");
await call(B, "POST", `/api/spaces/${classId}/assignments/${a1}/submit`, { action: "submit" });

/* ------------------------------ grading flow ----------------------------- */

r = await call(A, "GET", `/api/spaces/${classId}/assignments/${a1}`);
const rosterB = r.json?.data?.roster?.find((x) => x.workspaceId === bWs);
ok("roster shows B submitted", rosterB?.status === "submitted" && Boolean(rosterB?.submissionId));
ok("roster shows C not started", r.json?.data?.roster?.some((x) => x.status === "not_started"));
const bSubId = rosterB.submissionId;

r = await call(B, "GET", `/api/spaces/${classId}/assignments/${a1}`);
ok("student detail view (no roster)", r.json?.ok && !r.json.data.roster && r.json.data.mine?.status === "submitted");

r = await call(A, "PATCH", `/api/spaces/${classId}/assignments/${a1}/submissions/${bSubId}`, {
  feedback: "Solid work — handle empty input too.",
  grade: "92/100",
});
ok("instructor saves draft feedback", r.json?.ok);
r = await call(B, "GET", `/api/spaces/${classId}/assignments/${a1}`);
ok("feedback hidden until reviewed", r.json?.data?.mine?.feedback === null && r.json?.data?.mine?.grade === null);

r = await call(B, "PATCH", `/api/spaces/${classId}/assignments/${a1}/submissions/${bSubId}`, { grade: "100" });
ok("student cannot grade", r.res.status === 404);

r = await call(A, "PATCH", `/api/spaces/${classId}/assignments/${a1}/submissions/${bSubId}`, { markReviewed: true });
ok("mark reviewed", r.json?.ok);
r = await call(B, "GET", `/api/spaces/${classId}/assignments/${a1}`);
ok(
  "student sees feedback + grade after review",
  r.json?.data?.mine?.status === "reviewed" &&
    r.json.data.mine.feedback?.includes("Solid work") &&
    r.json.data.mine.grade === "92/100",
);
r = await call(B, "POST", `/api/spaces/${classId}/assignments/${a1}/submit`, { action: "unsubmit" });
ok("unsubmit after review → 409", r.res.status === 409);

r = await call(C, "POST", `/api/spaces/${classId}/assignments/${a1}/submissions/${bSubId}/ai-review`);
ok("classmate cannot run AI review", r.res.status === 404);

r = await call(B, "GET", `/api/spaces/${classId}/assignments`);
const mineRow = r.json?.data?.assignments?.find((x) => x.id === a1);
ok("student list shows status + grade", mineRow?.mine?.status === "reviewed" && mineRow?.mine?.grade === "92/100");

/* ------------------------------ billing caps ----------------------------- */

// Fill the classroom to the free cap (A,B,C + 2 more = 5).
const D = await newUser("Dia Student", `dia.${t}@e2e.test`);
const E = await newUser("Eli Student", `eli.${t}@e2e.test`);
for (const u of [D, E]) {
  r = await call(u, "POST", "/api/spaces/join", { code: classCode });
  if (!r.json?.ok) throw new Error("fill join failed");
}
const F = await newUser("Fay Student", `fay.${t}@e2e.test`);
r = await call(F, "POST", "/api/spaces/join", { code: classCode });
ok("6th member blocked on free plan → 402", r.res.status === 402 && r.json?.error?.code === "UPGRADE_REQUIRED");
r = await call(F, "GET", `/space/join/${classCode}`, null, { redirect: "manual" });
ok("invite-link join when full → /space?invite=full", r.res.status === 307 && (r.res.headers.get("location") ?? "").includes("invite=full"));
r = await call(B, "POST", "/api/spaces/join", { code: classCode });
ok("existing member re-join still fine at cap", r.json?.ok);

if (!billingEnabled) {
  skip("webhook upgrade/downgrade cycle", "server started without Stripe env");
} else {
  // Guards that run before any Stripe API call:
  r = await call(B, "POST", `/api/spaces/${classId}/billing/checkout`, { seats: 10 });
  ok("non-owner cannot checkout", r.res.status === 404);
  r = await call(A, "POST", `/api/spaces/${classId}/billing/checkout`, { seats: 2 });
  ok("seats below member count rejected", r.res.status === 400);
  r = await call(A, "POST", `/api/spaces/${classId}/billing/portal`);
  ok("portal without billing history → 400", r.res.status === 400);

  // Signed fake webhook: subscription active with 10 seats.
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  let wh = await postWebhook({
    id: `evt_${t}_1`,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: `sub_e2e_${t}`,
        object: "subscription",
        status: "active",
        metadata: { spaceId: classId },
        items: { data: [{ quantity: 10, current_period_end: periodEnd }] },
      },
    },
  });
  ok("signed webhook accepted", wh.status === 200, `status ${wh.status}`);

  r = await call(A, "GET", `/api/spaces/${classId}`);
  ok(
    "space upgraded: active, 10 seats",
    r.json?.data?.billing?.active === true && r.json.data.billing.seats === 10 && r.json.data.billing.memberCap === 10,
  );
  r = await call(F, "POST", "/api/spaces/join", { code: classCode });
  ok("6th member joins after upgrade", r.json?.ok);

  r = await call(A, "POST", `/api/spaces/${classId}/assignments`, { title: "Assignment 3", instructions: "x" });
  ok("assignment cap lifted on active plan", r.json?.ok);

  // Cancel → back to free caps; nobody is kicked.
  wh = await postWebhook({
    id: `evt_${t}_2`,
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: `sub_e2e_${t}`,
        object: "subscription",
        status: "canceled",
        metadata: { spaceId: classId },
        items: { data: [] },
      },
    },
  });
  ok("cancellation webhook accepted", wh.status === 200);
  r = await call(A, "GET", `/api/spaces/${classId}`);
  ok(
    "space back on free plan, members kept",
    r.json?.data?.billing?.active === false && r.json.data.billing.memberCount === 6,
  );
  const G = await newUser("Gus Student", `gus.${t}@e2e.test`);
  r = await call(G, "POST", "/api/spaces/join", { code: classCode });
  ok("over-cap space blocks NEW joins after lapse", r.res.status === 402);
  r = await call(F, "GET", `/api/spaces/${classId}`);
  ok("existing member still has access after lapse", r.json?.ok);

  // Bad signature rejected.
  const raw = JSON.stringify({ id: "evt_bad", type: "customer.subscription.updated", data: { object: {} } });
  const bad = await fetch(BASE + "/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": stripeSig(raw, "whsec_wrong") },
    body: raw,
  });
  ok("bad webhook signature → 400", bad.status === 400);
}

/* -------------------------------- cleanup -------------------------------- */

r = await call(A, "DELETE", `/api/spaces/${classId}`);
ok("delete classroom", r.json?.ok);
r = await call(A, "DELETE", `/api/spaces/${teamId}`);
ok("delete team space", r.json?.ok);
r = await call(B, "GET", `/api/workspaces/${bWs}`);
ok("B's submission workspace survives classroom deletion", r.json?.ok);

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail ? 1 : 0);
