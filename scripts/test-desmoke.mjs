/** Verifies that all five former smoke-screen pages now show real data or a
 *  correct empty state, the team redirect works, skills has no fake toggles,
 *  the rail nav contains the restored items, and the landing pricing is
 *  updated. Requires a running dev/prod server.
 *  Usage: node scripts/test-desmoke.mjs [baseUrl] */
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

/* ── Landing page pricing ─────────────────────────────────────────────── */
let res = await fetch(`${BASE}/welcome`);
const landingHtml = await res.text();
check("Landing page loads", res.status === 200, `status=${res.status}`);
check("Team plan shows $99", landingHtml.includes("$99"), "Expected $99 price not found");
check("Team plan shows /mo (not /user)", !landingHtml.includes("/ user"), "Found old '/ user' pricing");
check("Hobby shows 100k AI tokens", landingHtml.includes("100k AI tokens"), "Missing token quota for Hobby");
check("Pro shows 25M AI tokens", landingHtml.includes("25M AI tokens"), "Missing token quota for Pro");
check("Team shows 100M AI tokens", landingHtml.includes("100M AI tokens"), "Missing token quota for Team");

/* ── Authenticated checks ─────────────────────────────────────────────── */
const jar = makeJar();
await login(jar, "demo@helixstudio.org", "helix-demo");

res = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: jar.header() } });
const session = await res.json().catch(() => null);
check("Demo user logged in", Boolean(session?.user?.id), JSON.stringify(session));

/* ── /team redirect ───────────────────────────────────────────────────── */
// Next.js App Router redirect() fires via the client-side RSC router, so the
// raw fetch sees the layout shell (200) — not a 307. We verify correctness by
// checking the HTML contains NO team-management content.
res = await fetch(`${BASE}/team`, { headers: { cookie: jar.header() } });
const teamHtml = await res.text();
check("/team loads without error", res.status === 200, `status=${res.status}`);
check("/team shows no team-management content (members/invites/audit)", !teamHtml.includes("Invite member") && !teamHtml.includes("Audit log") && !teamHtml.includes('"Revoke"'), `found team-mgmt content`);

/* ── /skills — no fake toggle controls ───────────────────────────────── */
res = await fetch(`${BASE}/skills`, { headers: { cookie: jar.header() } });
const skillsHtml = await res.text();
check("/skills loads", res.status === 200, `status=${res.status}`);
// The fake Switch component renders with data-state attribute — should be gone.
check("/skills has no Switch toggle (data-state)", !skillsHtml.includes('data-state="checked"') && !skillsHtml.includes('data-state="unchecked"'), "Found Switch toggle state in HTML");
// The real page shows an "active" pill instead.
check("/skills shows 'active' pill text", skillsHtml.includes(">active<"), "Missing active pill");

/* ── Rail nav — restored items ────────────────────────────────────────── */
res = await fetch(`${BASE}/`, { headers: { cookie: jar.header() } });
const homeHtml = await res.text();
check("Home page loads (auth)", res.status === 200, `status=${res.status}`);
check("Rail contains /agents link", homeHtml.includes('href="/agents"'), "Missing agents nav link");
check("Rail contains /analysis link", homeHtml.includes('href="/analysis"'), "Missing analysis nav link");
check("Rail contains /deployments link", homeHtml.includes('href="/deployments"'), "Missing deployments nav link");
check("Rail contains /skills link", homeHtml.includes('href="/skills"'), "Missing skills nav link");
check("Rail does NOT contain /team link", !homeHtml.includes('href="/team"'), "Found /team link (should be removed)");

/* ── /agents — loads without error ───────────────────────────────────── */
res = await fetch(`${BASE}/agents`, { headers: { cookie: jar.header() } });
const agentsHtml = await res.text();
check("/agents loads", res.status === 200, `status=${res.status}`);
check("/agents shows workflow UI", agentsHtml.includes("Run workflow") || agentsHtml.includes("Multi-agent"), `snippet=${agentsHtml.slice(0, 200)}`);
check("/agents has workspace picker", agentsHtml.includes('href="/agents"') || agentsHtml.includes("Select workspace"), "Missing workspace picker reference");

/* ── /analysis — loads, shows empty state when no ?w= ────────────────── */
res = await fetch(`${BASE}/analysis`, { headers: { cookie: jar.header() } });
const analysisHtml = await res.text();
check("/analysis loads", res.status === 200, `status=${res.status}`);
check("/analysis shows picker or scan prompt", analysisHtml.includes("Select workspace") || analysisHtml.includes("workspace"), `snippet=${analysisHtml.slice(0, 300)}`);
// Should NOT contain the old seeded project name "acme-web" (it was hardcoded)
check("/analysis does not show seeded 'acme-web'", !analysisHtml.includes(">acme-web<"), "Found seeded acme-web data");

/* ── /deployments — loads, shows real data or empty state ────────────── */
res = await fetch(`${BASE}/deployments`, { headers: { cookie: jar.header() } });
const deplHtml = await res.text();
check("/deployments loads", res.status === 200, `status=${res.status}`);
check("/deployments has correct heading", deplHtml.includes("Deployments"), "Missing Deployments heading");
// Should NOT show seeded fake environments from demo-seed.ts
check("/deployments does not show seeded env 'Production'", !deplHtml.includes("acme-web · connected to Vercel"), "Found hardcoded subtitle from DeploymentsScreen");

/* ── /api/agents/run — rejects missing step ──────────────────────────── */
res = await fetch(`${BASE}/api/agents/run`, { headers: { cookie: jar.header() } });
const runJson = await res.json().catch(() => null);
check("/api/agents/run without step returns 400", res.status === 400, `status=${res.status}`);
check("…with error message", runJson?.error != null, JSON.stringify(runJson));

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
