/**
 * E2E for the self-verifying agent. Runs against a dev server on localhost:3000.
 * Locally there's no Vercel sandbox, so the real "build runs + auto-fixes" path
 * only happens in prod; here we assert command SELECTION + graceful skips via
 * the no-AI-cost /verify endpoint, plus that the chat route accepts the flag.
 *   node scripts/e2e-verify.mjs
 */

const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n + " " + extra); } };

function jar() {
  const c = new Map();
  return {
    absorb: (r) => { for (const x of r.headers.getSetCookie?.() ?? []) { const [p] = x.split(";"); const i = p.indexOf("="); c.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } },
    header: () => [...c.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}
async function call(u, m, p, b) {
  const r = await fetch(BASE + p, { method: m, headers: { ...(u ? { cookie: u.header() } : {}), ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined });
  u?.absorb(r);
  let j = null; try { j = await r.clone().json(); } catch {}
  return { res: r, json: j };
}
async function newUser(name, email) {
  const u = jar();
  const s = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password: "password-123" }) });
  if (s.status !== 201) throw new Error("signup " + s.status);
  const cs = await fetch(BASE + "/api/auth/csrf", { headers: { cookie: u.header() } }); u.absorb(cs);
  const { csrfToken } = await cs.json();
  const lg = await fetch(BASE + "/api/auth/callback/credentials", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: u.header() }, body: new URLSearchParams({ csrfToken, email, password: "password-123" }) });
  u.absorb(lg);
  return u;
}
async function mkWorkspace(u, files) {
  const w = (await call(u, "POST", "/api/workspaces", { mode: "SCRATCH", name: "verify-e2e" })).json.data.id;
  if (files.length) await call(u, "POST", `/api/workspaces/${w}/files`, { files });
  return w;
}

const t = Date.now();
const A = await newUser("Vera Verify", `vera.${t}@e2e.test`);
console.log("user ready");

/* --- 1. static workspace → skip (no sandbox needed; selectVerifyCommand) --- */
let ws = await mkWorkspace(A, [{ path: "index.html", content: "<h1>hi</h1>" }]);
let r = await call(A, "POST", `/api/workspaces/${ws}/verify`);
ok("static site → skipped", r.json?.data?.verify?.status === "skipped", JSON.stringify(r.json?.data));
ok("static skip reason mentions static", /static/i.test(r.json?.data?.verify?.reason ?? ""), r.json?.data?.verify?.reason);

/* --- 2. node, no build/test script → skip --- */
ws = await mkWorkspace(A, [
  { path: "package.json", content: JSON.stringify({ name: "x", scripts: { lint: "echo hi" } }) },
  { path: "index.js", content: "console.log(1)" },
]);
r = await call(A, "POST", `/api/workspaces/${ws}/verify`);
ok("node w/o build|test → skipped", r.json?.data?.verify?.status === "skipped", JSON.stringify(r.json?.data));
ok("skip reason mentions build/test", /build or test/i.test(r.json?.data?.verify?.reason ?? ""), r.json?.data?.verify?.reason);

/* --- 3. node WITH build script → selects npm run build; locally the sandbox
       is unavailable so it skips gracefully ("couldn't reach the sandbox").
       In prod this actually runs the build. --- */
ws = await mkWorkspace(A, [
  { path: "package.json", content: JSON.stringify({ name: "x", scripts: { build: "node -e \"process.exit(1)\"" } }) },
  { path: "index.js", content: "console.log(1)" },
]);
r = await call(A, "POST", `/api/workspaces/${ws}/verify`);
const v3 = r.json?.data?.verify;
ok("node w/ build → ran or skipped-gracefully (never errors the route)", r.res.status === 200 && ["passed", "failed", "skipped"].includes(v3?.status), JSON.stringify(v3));
ok("when skipped locally, command was selected or reason is sandbox", v3?.command === "npm run build" || /sandbox/i.test(v3?.reason ?? ""), JSON.stringify(v3));

/* --- 4. chat route accepts the verify flag (no 4xx) --- */
const chat = await fetch(`${BASE}/api/workspaces/${ws}/chat`, { method: "POST", headers: { cookie: A.header(), "content-type": "application/json" }, body: JSON.stringify({ message: "say hi", mode: "build", verify: false }) });
ok("chat route accepts {verify:false}", chat.status === 200, "status " + chat.status);
const badVerify = await fetch(`${BASE}/api/workspaces/${ws}/chat`, { method: "POST", headers: { cookie: A.header(), "content-type": "application/json" }, body: JSON.stringify({ message: "x", verify: "yes" }) });
ok("chat route rejects non-boolean verify", badVerify.status === 400, "status " + badVerify.status);

/* --- 5. non-owner cannot verify someone else's workspace --- */
const B = await newUser("Bo Other", `bo.${t}@e2e.test`);
r = await call(B, "POST", `/api/workspaces/${ws}/verify`);
ok("non-owner verify → 404", r.res.status === 404);

await call(A, "DELETE", `/api/workspaces/${ws}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
