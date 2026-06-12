/** E2E for profile picture + display name. node scripts/e2e-profile.mjs */
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

const t = Date.now();
const A = await newUser("Pat Profile", `pat.${t}@e2e.test`);
console.log("user ready");

// A space where A is the owner/member — to read A's image back via the space API.
const sp = (await call(A, "POST", "/api/spaces", { name: "P", kind: "team" })).json.data.id;
const myMember = async () => {
  const d = await call(A, "GET", `/api/spaces/${sp}`);
  return d.json.data.members.find((m) => m.isYou);
};

const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";

let r = await call(A, "PATCH", "/api/profile", { image: IMG });
ok("set avatar → 200 + echoes image", r.res.status === 200 && r.json?.data?.image === IMG, JSON.stringify(r.json?.data)?.slice(0, 60));
ok("avatar shows on space member chip", (await myMember())?.image === IMG);

r = await call(A, "PATCH", "/api/profile", { name: "Patricia P" });
ok("set display name → 200", r.res.status === 200 && r.json?.data?.name === "Patricia P");
ok("name shows on member chip", (await myMember())?.name === "Patricia P");

r = await call(A, "PATCH", "/api/profile", { image: null });
ok("clear avatar → 200", r.res.status === 200 && r.json?.data?.image === null);
ok("member chip avatar cleared", (await myMember())?.image == null);

r = await call(A, "PATCH", "/api/profile", { image: "not-a-data-url" });
ok("non-data-URL rejected → 400", r.res.status === 400);
r = await call(A, "PATCH", "/api/profile", { image: "data:image/gif;base64,AAAA" });
ok("disallowed type (gif) rejected → 400", r.res.status === 400);
r = await call(A, "PATCH", "/api/profile", { image: "data:image/png;base64," + "A".repeat(120000) });
ok("over-cap image rejected → 400", r.res.status === 400);
r = await call(A, "PATCH", "/api/profile", {});
ok("empty patch → 400", r.res.status === 400);

// auth required
r = await call(null, "PATCH", "/api/profile", { name: "x" });
ok("unauthenticated → 401", r.res.status === 401);

await call(A, "DELETE", `/api/spaces/${sp}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
