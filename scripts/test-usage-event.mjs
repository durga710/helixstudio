/** One real chat turn, then assert an AiUsageEvent row landed and the CSV
 * export contains it. Spends a few real tokens. Usage:
 * node scripts/test-usage-event.mjs [baseUrl] */
const BASE = process.argv[2] ?? "http://localhost:3000";
let cookies = {};
const ch = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
const store = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";");
    const i = p.indexOf("=");
    cookies[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
};
let fail = 0;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : `  ${extra}`}`);
  if (!cond) fail++;
};

let res = await fetch(`${BASE}/api/auth/csrf`);
store(res);
const { csrfToken } = await res.json();
res = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  redirect: "manual",
  headers: { cookie: ch(), "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken, email: "demo@helixstudio.org", password: "helix-demo" }),
});
store(res);

res = await fetch(`${BASE}/api/workspaces`, {
  method: "POST",
  headers: { cookie: ch(), "Content-Type": "application/json" },
  body: JSON.stringify({ name: "usage-event-test", mode: "SCRATCH" }),
});
let json = await res.json();
const wsId = json?.data?.id ?? json?.data?.workspace?.id;
check("created workspace", Boolean(wsId), JSON.stringify(json)?.slice(0, 200));

res = await fetch(`${BASE}/api/workspaces/${wsId}/chat`, {
  method: "POST",
  headers: { cookie: ch(), "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Reply with the single word: ok. Do not use any tools." }),
});
const streamText = await res.text();
check("chat turn returned 200", res.status === 200, `status=${res.status} ${streamText.slice(0, 200)}`);

res = await fetch(`${BASE}/api/admin/usage/export?days=1`, { headers: { cookie: ch() } });
const csv = await res.text();
const lines = csv.trim().split(/\r?\n/);
const chatRows = lines.filter((l) => l.includes('"chat"') && l.includes("demo@helixstudio.org"));
check("CSV contains a chat usage event for the demo user", chatRows.length >= 1, `rows=${lines.length}`);
if (chatRows[0]) console.log("  latest:", chatRows[0]);

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
