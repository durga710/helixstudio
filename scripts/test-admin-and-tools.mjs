/** Verifies: /admin is 404 for anonymous, 200 for a signed-in user (dev), and
 * the rendered page exposes the new edit_file tool + raised move limits +
 * verify-default ON. Usage: node scripts/test-admin-and-tools.mjs [baseUrl] */
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

// anonymous
let res = await fetch(`${BASE}/admin`, { redirect: "manual" });
check("anonymous /admin is not 200", res.status !== 200, `status=${res.status}`);

// demo login
res = await fetch(`${BASE}/api/auth/csrf`);
store(res);
const { csrfToken } = await res.json();
res = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  redirect: "manual",
  headers: { cookie: ch(), "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken, email: "demo@helixstudio.org", password: "helix-demo" }),
});
store(res);

res = await fetch(`${BASE}/admin`, { headers: { cookie: ch() } });
const html = await res.text();
check("signed-in /admin renders (dev)", res.status === 200, `status=${res.status}`);
check("admin shows the edit_file tool", html.includes("edit_file"));
const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
check("admin shows raised move cap (24)", /Max moves per turn[^0-9]{0,80}24/.test(stripped), "no 24 near move cap");
check("admin shows auto-verify ON", /Auto-verify default\s+ON/.test(stripped));
check("admin shows token ceiling", html.includes("Token ceiling per turn"));
check("admin shows system prompts section", html.includes("System prompts"));
check("admin shows usage section", html.includes("AI usage"));

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
