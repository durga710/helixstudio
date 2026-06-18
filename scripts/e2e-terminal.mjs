/**
 * End-to-end test for the editor terminal (/api/workspaces/:id/exec).
 *
 * Runs against a server started with a DATABASE_URL and HELIX_LOCAL_RUNNER=1, so
 * commands execute locally (execLocal) rather than in a cloud sandbox. Flow:
 *   1. demo login (credentials flow)
 *   2. create a SCRATCH workspace
 *   3. write a known file into it
 *   4. run commands and assert stdout / stderr / exit codes
 *   5. assert input validation (empty + over-length commands rejected)
 *
 * Usage: node scripts/e2e-terminal.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
let cookies = {};

function cookieHeader() {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
function storeCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { cookie: cookieHeader(), ...(opts.headers ?? {}) },
    redirect: "manual",
  });
  storeCookies(res);
  return res;
}
async function api(path, opts = {}) {
  const res = await req(path, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
let failures = 0;
function check(label, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : `  ${extra}`}`);
  if (!cond) failures++;
}

const exec = (wsId, command) =>
  api(`/api/workspaces/${wsId}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });

// ---- 1. demo login ----
const csrf = (await api("/api/auth/csrf")).json?.csrfToken;
check("got csrf token", !!csrf);
const login = await req("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken: csrf, email: "demo@helixstudio.org", password: "helix-demo" }),
});
check("demo login", login.status === 302 || login.status === 200, `status=${login.status}`);
const me = await api("/api/auth/session");
check("session established", !!me.json?.user, JSON.stringify(me.json));

// ---- 2. create a scratch workspace ----
const create = await api("/api/workspaces", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "SCRATCH", name: "terminal-e2e" }),
});
const wsId = create.json?.data?.id;
check("workspace created", !!wsId, JSON.stringify(create.json));
if (!wsId) {
  console.error("\nCannot continue without a workspace — is DATABASE_URL set on the server?");
  process.exit(1);
}

// ---- 3. write a known file ----
const MARKER = "hi-from-helix-terminal";
const save = await api(`/api/workspaces/${wsId}/files`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ files: [{ path: "hello.txt", content: `${MARKER}\n` }] }),
});
check("file written", save.json?.ok === true, JSON.stringify(save.json));

// ---- 4. run commands ----
const ls = await exec(wsId, "ls");
check("ls exit 0", ls.json?.data?.exitCode === 0, JSON.stringify(ls.json));
check("ls lists the file", (ls.json?.data?.stdout ?? "").includes("hello.txt"), JSON.stringify(ls.json?.data));

const cat = await exec(wsId, "cat hello.txt");
check("cat returns file content", (cat.json?.data?.stdout ?? "").includes(MARKER), JSON.stringify(cat.json?.data));

const code = await exec(wsId, "exit 7");
check("non-zero exit code captured", code.json?.data?.exitCode === 7, JSON.stringify(code.json?.data));

const stderr = await exec(wsId, "ls /no/such/path 1>&2");
check("stderr captured", (stderr.json?.data?.stderr ?? "").length > 0, JSON.stringify(stderr.json?.data));

// ---- 5. input validation ----
const empty = await exec(wsId, "   ");
check("empty command rejected (400)", empty.status === 400, `status=${empty.status}`);

const tooLong = await exec(wsId, "echo " + "x".repeat(600));
check("over-length command rejected (400)", tooLong.status === 400, `status=${tooLong.status}`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll terminal e2e checks passed");
process.exit(failures ? 1 : 0);
