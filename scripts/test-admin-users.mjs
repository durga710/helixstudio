/** Verifies the admin user-management surface end-to-end against a dev server:
 * page gating, the PATCH override API (tier / token limit / reset / suspend),
 * limit enforcement on an AI route, suspension enforcement on guarded APIs,
 * and the CSV export. Requires a database (DATABASE_URL) and the demo user.
 * Usage: node scripts/test-admin-users.mjs [baseUrl] */
const BASE = process.argv[2] ?? "http://localhost:3000";

function makeJar() {
  const cookies = {};
  return {
    header: () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "),
    store: (res) => {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [p] = c.split(";");
        const i = p.indexOf("=");
        cookies[p.slice(0, i).trim()] = p.slice(i + 1).trim();
      }
    },
  };
}

let fail = 0;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : `  ${extra}`}`);
  if (!cond) fail++;
};

async function login(jar, email, password) {
  let res = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: jar.header() } });
  jar.store(res);
  const { csrfToken } = await res.json();
  res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  jar.store(res);
}

async function guestLogin(jar) {
  let res = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: jar.header() } });
  jar.store(res);
  const { csrfToken } = await res.json();
  // "Continue as guest" is its own credentials provider (id: "guest").
  res = await fetch(`${BASE}/api/auth/callback/guest`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken }),
  });
  jar.store(res);
}

/* ---------------- anonymous: everything admin is invisible ---------------- */
let res = await fetch(`${BASE}/admin/users`, { redirect: "manual" });
check("anonymous /admin/users is not 200", res.status !== 200, `status=${res.status}`);

res = await fetch(`${BASE}/api/admin/users/whatever`, { method: "PATCH" });
check("anonymous PATCH /api/admin/users/* is 404", res.status === 404, `status=${res.status}`);
const anonBody = await res.json().catch(() => null);
check("…and returns the JSON error envelope", anonBody?.ok === false, JSON.stringify(anonBody));

res = await fetch(`${BASE}/api/admin/usage/export`);
check("anonymous CSV export is 404", res.status === 404, `status=${res.status}`);

/* ---------------- admin (demo user is admin in dev, no ADMIN_EMAILS) ------ */
const admin = makeJar();
await login(admin, "demo@helixstudio.org", "helix-demo");

res = await fetch(`${BASE}/admin/users`, { headers: { cookie: admin.header() } });
const listHtml = await res.text();
check("admin /admin/users renders", res.status === 200, `status=${res.status}`);
check("…and lists the demo user", listHtml.includes("demo@helixstudio.org"));

res = await fetch(`${BASE}/admin`, { headers: { cookie: admin.header() } });
const overviewHtml = await res.text();
check("/admin shows the User management card", overviewHtml.includes("User management"));
check("/admin shows tier quotas", overviewHtml.includes("Free tier quota"));

// demo user's id from the session
res = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: admin.header() } });
const session = await res.json().catch(() => null);
const demoId = session?.user?.id;
check("got demo user id from session", Boolean(demoId), JSON.stringify(session));

/* ---------------- detail page ---------------- */
res = await fetch(`${BASE}/admin/users/${demoId}`, { headers: { cookie: admin.header() } });
const detailHtml = await res.text();
check("detail page renders", res.status === 200, `status=${res.status}`);
check("…with Admin actions", detailHtml.includes("Admin actions"));
check("…with Recent AI usage", detailHtml.includes("Recent AI usage"));

/* ---------------- PATCH: tier ---------------- */
const patch = (id, body) =>
  fetch(`${BASE}/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { cookie: admin.header(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

res = await patch(demoId, { tier: "pro" });
let json = await res.json().catch(() => null);
check("PATCH tier=pro succeeds", res.status === 200 && json?.data?.tier === "pro", JSON.stringify(json));

/* ---------------- PATCH: token limit blocks an AI route ---------------- */
res = await patch(demoId, { tokenLimit: 1, resetTokens: false });
json = await res.json().catch(() => null);
check("PATCH tokenLimit=1 succeeds", res.status === 200 && json?.data?.tokenLimit === 1, JSON.stringify(json));

// bump the period counter past the limit via resetTokens=false + a real check:
// the budget check uses periodTokens, which is 0 after a fresh month — so set
// the limit to 0 instead (0 = AI disabled) for a deterministic block.
res = await patch(demoId, { tokenLimit: 0 });
json = await res.json().catch(() => null);
check("PATCH tokenLimit=0 succeeds", res.status === 200 && json?.data?.tokenLimit === 0, JSON.stringify(json));

// any AI route should now refuse: use the workspace review route via a fresh
// workspace (cheapest deterministic AI-gated endpoint without spending tokens).
res = await fetch(`${BASE}/api/workspaces`, {
  method: "POST",
  headers: { cookie: admin.header(), "Content-Type": "application/json" },
  body: JSON.stringify({ name: "limit-test", mode: "SCRATCH" }),
});
json = await res.json().catch(() => null);
const wsId = json?.data?.id ?? json?.data?.workspace?.id;
check("created a scratch workspace", res.status === 200 && Boolean(wsId), JSON.stringify(json)?.slice(0, 200));

res = await fetch(`${BASE}/api/workspaces/${wsId}/review`, {
  method: "POST",
  headers: { cookie: admin.header() },
});
json = await res.json().catch(() => null);
check(
  "AI route refuses with TOKEN_LIMIT at limit 0",
  res.status === 403 && json?.error?.code === "TOKEN_LIMIT",
  `status=${res.status} ${JSON.stringify(json)}`,
);

res = await patch(demoId, { tokenLimit: null, resetTokens: true });
json = await res.json().catch(() => null);
check(
  "PATCH clears limit + resets counters",
  res.status === 200 && json?.data?.tokenLimit === null && json?.data?.tokensUsed === 0,
  JSON.stringify(json),
);

/* ---------------- self-suspend refused ---------------- */
res = await patch(demoId, { suspended: true });
json = await res.json().catch(() => null);
check("self-suspend is refused (400)", res.status === 400, `status=${res.status} ${JSON.stringify(json)}`);

/* ---------------- suspend a guest, guarded APIs 403 ---------------- */
const guest = makeJar();
await guestLogin(guest);
res = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: guest.header() } });
const guestSession = await res.json().catch(() => null);
const guestId = guestSession?.user?.id;
check("created a guest user", Boolean(guestId), JSON.stringify(guestSession));

if (guestId) {
  res = await patch(guestId, { suspended: true });
  json = await res.json().catch(() => null);
  check("admin suspends the guest", res.status === 200 && Boolean(json?.data?.suspendedAt), JSON.stringify(json));

  res = await fetch(`${BASE}/api/workspaces`, {
    method: "POST",
    headers: { cookie: guest.header(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "suspended-test", mode: "SCRATCH" }),
  });
  json = await res.json().catch(() => null);
  check(
    "suspended guest gets 403 SUSPENDED on a guarded API",
    res.status === 403 && json?.error?.code === "SUSPENDED",
    `status=${res.status} ${JSON.stringify(json)}`,
  );

  res = await patch(guestId, { suspended: false });
  json = await res.json().catch(() => null);
  check("admin unsuspends the guest", res.status === 200 && json?.data?.suspendedAt === null, JSON.stringify(json));
}

/* ---------------- restore demo tier + CSV ---------------- */
res = await patch(demoId, { tier: "free" });
json = await res.json().catch(() => null);
check("restored demo tier to free", res.status === 200 && json?.data?.tier === "free", JSON.stringify(json));

res = await fetch(`${BASE}/api/admin/usage/export?days=30`, { headers: { cookie: admin.header() } });
const csv = await res.text();
check("CSV export is 200 text/csv", res.status === 200 && (res.headers.get("content-type") ?? "").includes("text/csv"));
check("CSV has the header row", csv.startsWith("createdAt,userEmail,kind,provider,model,workspaceId,tokens"));

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
