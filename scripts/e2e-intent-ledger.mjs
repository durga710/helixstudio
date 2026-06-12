/**
 * End-to-end smoke test for the Intent Ledger + Intentional Undo feature.
 * Runs against a local dev server with the demo account:
 *   1. demo login (credentials flow)
 *   2. create a SCRATCH workspace
 *   3. manual save A (capture → manual intent)
 *   4. manual save B editing a different region (second intent)
 *   5. GET /ledger → line attribution spans both intents
 *   6. undo intent A → preview (expect patch/exact, no AI) → apply
 *   7. verify B's work survived and A's is gone; undo intent recorded
 *   8. undo the undo → A's content returns
 *
 * Usage: node scripts/e2e-intent-ledger.mjs [baseUrl]
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

// ---- 1. demo login ----
const csrfRes = await api("/api/auth/csrf");
const csrf = csrfRes.json?.csrfToken;
check("got csrf token", !!csrf);
const login = await req("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken: csrf, email: "demo@helixstudio.org", password: "helix-demo" }),
});
check("demo login", login.status === 302 || login.status === 200, `status=${login.status}`);
const me = await api("/api/auth/session");
check("session established", !!me.json?.user, JSON.stringify(me.json));

// ---- 2. create workspace ----
const create = await api("/api/workspaces", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "SCRATCH", name: "ledger-e2e" }),
});
const wsId = create.json?.data?.id;
check("workspace created", !!wsId, JSON.stringify(create.json));
if (!wsId) process.exit(1);

const FILE = "src/app.js";
const V1 = "function greet() {\n  return 'hello';\n}\n\nfunction main() {\n  console.log(greet());\n}\n";
// Intent A: add an invite feature (new file + edit app.js top region)
const INVITE = "export function invite(email) {\n  return `invited ${email}`;\n}\n";
const V2 = "import { invite } from './invite.js';\n\n" + V1 + "\nconsole.log(invite('a@b.c'));\n";
// Intent B: unrelated edit to the middle of app.js (greet message)
const V3 = V2.replace("return 'hello';", "return 'hello world';");

async function save(files) {
  return api(`/api/workspaces/${wsId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
}

// ---- 3-4. three manual intents: base, A (invite), B (greeting) ----
const s0 = await save([{ path: FILE, content: V1 }]);
check("save base", s0.json?.ok === true, JSON.stringify(s0.json));
const sA = await save([
  { path: FILE, content: V2 },
  { path: "src/invite.js", content: INVITE },
]);
check("save intent A (invite feature)", sA.json?.ok === true, JSON.stringify(sA.json));
const sB = await save([{ path: FILE, content: V3 }]);
check("save intent B (greeting tweak)", sB.json?.ok === true, JSON.stringify(sB.json));

// ---- 5. intents list + ledger ----
const intents = await api(`/api/workspaces/${wsId}/intents`);
const rows = intents.json?.data?.intents ?? [];
check("3 intents recorded", rows.length === 3, `got ${rows.length}: ${JSON.stringify(rows.map((r) => r.title))}`);
const intentB = rows[0];
const intentA = rows[1];
check("intent A touched 2 files", intentA?.paths.length === 2, JSON.stringify(intentA?.paths));

const ledger = await api(`/api/workspaces/${wsId}/ledger?path=${encodeURIComponent(FILE)}`);
const ranges = ledger.json?.data?.ranges ?? [];
const intentsMeta = ledger.json?.data?.intents ?? {};
const attributedIds = new Set(ranges.map((r) => r.intentId).filter(Boolean));
check(
  "ledger attributes lines to A and B",
  attributedIds.has(intentA?.id) && attributedIds.has(intentB?.id),
  JSON.stringify({ ranges, ids: { A: intentA?.id, B: intentB?.id } }),
);
const line1 = ranges.find((r) => 1 >= r.start && 1 <= r.end);
check("line 1 (import) blamed on intent A", line1?.intentId === intentA?.id, JSON.stringify(line1));
check("intent meta carries userRequest", !!intentsMeta[intentA?.id]?.userRequest, JSON.stringify(intentsMeta[intentA?.id]));

// ---- 6. undo intent A (invite) — preview must be mechanical ----
const preview = await api(`/api/workspaces/${wsId}/intents/${intentA.id}/undo-preview`, { method: "POST" });
const prop = preview.json?.data;
check("undo preview built", !!prop, JSON.stringify(preview.json));
const appEntry = prop?.entries.find((e) => e.path === FILE);
const invEntry = prop?.entries.find((e) => e.path === "src/invite.js");
check("invite.js reverts as exact delete", invEntry?.action === "delete" && invEntry?.method === "exact", JSON.stringify(invEntry));
check("app.js reverts via inverse patch (B preserved)", appEntry?.method === "patch", JSON.stringify(appEntry?.method));
check(
  "patched app.js keeps B's greeting and drops the invite",
  appEntry?.proposed?.includes("hello world") && !appEntry?.proposed?.includes("invite"),
  JSON.stringify(appEntry?.proposed),
);
check("no unresolved conflicts", prop?.unresolved.length === 0, JSON.stringify(prop?.unresolved));

// ---- 7. apply ----
const apply = await api(`/api/workspaces/${wsId}/intents/${intentA.id}/undo-apply`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    entries: prop.entries.map((e) => ({ path: e.path, action: e.action, proposed: e.proposed })),
    baseHashes: prop.baseHashes,
  }),
});
check("undo applied", apply.json?.ok === true, JSON.stringify(apply.json));
const fileAfter = await api(`/api/workspaces/${wsId}/file?path=${encodeURIComponent(FILE)}`);
check(
  "post-undo content: B intact, A gone",
  fileAfter.json?.data?.content?.includes("hello world") && !fileAfter.json?.data?.content?.includes("invite"),
  JSON.stringify(fileAfter.json?.data?.content),
);
const inviteAfter = await api(`/api/workspaces/${wsId}/file?path=${encodeURIComponent("src/invite.js")}`);
check("invite.js deleted", inviteAfter.status === 404 || inviteAfter.json?.ok === false, `status=${inviteAfter.status}`);

const intents2 = await api(`/api/workspaces/${wsId}/intents`);
const rows2 = intents2.json?.data?.intents ?? [];
const undoRow = rows2.find((r) => r.kind === "undo");
const aRow = rows2.find((r) => r.id === intentA.id);
check("undo recorded as intent", !!undoRow && undoRow.revertsIntentId === intentA.id, JSON.stringify(undoRow));
check("intent A marked reverted", aRow?.status === "reverted", JSON.stringify(aRow?.status));

// ---- 8. undo the undo ----
const preview2 = await api(`/api/workspaces/${wsId}/intents/${undoRow.id}/undo-preview`, { method: "POST" });
const prop2 = preview2.json?.data;
check("undo-the-undo preview built", !!prop2 && prop2.entries.length > 0, JSON.stringify(preview2.json));
const apply2 = await api(`/api/workspaces/${wsId}/intents/${undoRow.id}/undo-apply`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    entries: prop2.entries.map((e) => ({ path: e.path, action: e.action, proposed: e.proposed })),
    baseHashes: prop2.baseHashes,
  }),
});
check("undo-the-undo applied", apply2.json?.ok === true, JSON.stringify(apply2.json));
const inviteBack = await api(`/api/workspaces/${wsId}/file?path=${encodeURIComponent("src/invite.js")}`);
check("invite.js restored", inviteBack.json?.data?.content?.includes("invited"), `status=${inviteBack.status}`);

// ---- 9. stale-preview guard (409) ----
const intents3 = await api(`/api/workspaces/${wsId}/intents`);
const freshA = intents3.json?.data?.intents.find((r) => r.id !== intentA.id && r.kind === "manual" && r.status !== "reverted");
if (freshA) {
  const p3 = await api(`/api/workspaces/${wsId}/intents/${freshA.id}/undo-preview`, { method: "POST" });
  if (p3.json?.data?.entries?.length) {
    await save([{ path: FILE, content: V3 + "\n// drift\n" }]); // workspace moves on after the preview
    const a3 = await api(`/api/workspaces/${wsId}/intents/${freshA.id}/undo-apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: p3.json.data.entries.map((e) => ({ path: e.path, action: e.action, proposed: e.proposed })),
        baseHashes: p3.json.data.baseHashes,
      }),
    });
    check("stale preview rejected with 409", a3.status === 409, `status=${a3.status} ${JSON.stringify(a3.json)}`);
  } else {
    console.log("SKIP  stale-preview check (no applicable entries)");
  }
} else {
  console.log("SKIP  stale-preview check (no fresh intent)");
}

// ---- cleanup ----
const del = await api(`/api/workspaces/${wsId}`, { method: "DELETE" });
check("test workspace cleaned up", del.json?.ok === true, JSON.stringify(del.json));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
