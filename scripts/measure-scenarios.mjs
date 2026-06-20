// Measure token cost per scenario against budget targets.
//   node --env-file=.env.local scripts/measure-scenarios.mjs build:static
//   node --env-file=.env.local scripts/measure-scenarios.mjs build:framework
//   node --env-file=.env.local scripts/measure-scenarios.mjs refactor:<wsid>
// Targets: small build <150K · big refactor <400K · full framework project ~700K.
import pg from "pg";
const B = (process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const DEMO = { email: "demo@helixstudio.org", password: "helix-demo" };
const arg = process.argv[2] || "build:static";
const jar = new Map();
const absorb = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const p=c.split(";")[0],i=p.indexOf("="); const n=p.slice(0,i).trim(),v=p.slice(i+1).trim(); if(v==="")jar.delete(n);else jar.set(n,v);} };
const ck = () => [...jar].map(([k,v])=>`${k}=${v}`).join("; ");
const J = (r) => r.json();
const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, max: 1 });
const sumTokens = async (wsid, sinceIso) => {
  const c = await pool.connect();
  try { const r = await c.query(`SELECT COALESCE(SUM(tokens),0) AS t, COUNT(*) AS n, STRING_AGG(DISTINCT kind, ',') AS kinds FROM "AiUsageEvent" WHERE "workspaceId"=$1 AND "createdAt" > $2`, [wsid, sinceIso]); return r.rows[0]; }
  finally { c.release(); }
};

const csrf = (await J(await fetch(`${B}/api/auth/csrf`).then(r=>{absorb(r);return r;}))).csrfToken;
absorb(await fetch(`${B}/api/auth/callback/credentials`, { method:"POST", headers:{ "content-type":"application/x-www-form-urlencoded", cookie: ck() }, body:new URLSearchParams({ csrfToken:csrf, ...DEMO, callbackUrl:`${B}/` }), redirect:"manual" }));
console.log("auth:", (await J(await fetch(`${B}/api/auth/session`, { headers:{ cookie: ck() } })))?.user?.email);

async function buildTurn(wsid, message) {
  const start = new Date().toISOString(); const t0 = Date.now();
  const res = await fetch(`${B}/api/workspaces/${wsid}/chat`, { method:"POST", headers:{ "content-type":"application/json", cookie: ck() }, body: JSON.stringify({ message, mode:"build", verify:true }) });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf=""; let final=null;
  outer: for(;;){ const {done,value}=await reader.read(); if(done)break; buf+=dec.decode(value,{stream:true}); let nl; while((nl=buf.indexOf("\n"))>=0){ const line=buf.slice(0,nl).trim(); buf=buf.slice(nl+1); if(!line)continue; let e; try{e=JSON.parse(line);}catch{continue;} if(e.type==="final"||e.type==="error"){final=e;break outer;} if(Date.now()-t0>280000)break outer; } }
  await new Promise(r=>setTimeout(r,1800));
  const u = await sumTokens(wsid, start);
  return { secs:((Date.now()-t0)/1000).toFixed(0), tokens:Number(u.t), reply:(final?.summary||final?.text||final?.error||"").slice(0,90) };
}

if (arg.startsWith("build:")) {
  const kind = arg.split(":")[1];
  const prompt = kind === "framework"
    ? "Build a team task manager: users sign up and log in with accounts, tasks are stored in a Postgres database, each task has a title, assignee, due date and status, plus a dashboard showing task counts by status."
    : "Build an expense tracker: add expenses with a name, amount and category, show a running total, and list them with a delete button.";
  const created = await J(await fetch(`${B}/api/workspaces`, { method:"POST", headers:{ "content-type":"application/json", cookie: ck() }, body: JSON.stringify({ mode:"SCRATCH", name:`Scn ${kind}`, buildKind:"app" }) }));
  const wsid = created?.data?.id;
  const r = await buildTurn(wsid, prompt);
  const files = (await J(await fetch(`${B}/api/workspaces/${wsid}/files`, { headers:{ cookie: ck() } })))?.data?.files ?? [];
  const fw = files.some(f=>/package\.json$/.test(f.path));
  const target = kind === "framework" ? 700 : 150;
  console.log(`\n[BUILD ${kind}] ws=${wsid}`);
  console.log(`  ${r.secs}s · ${(r.tokens/1000).toFixed(1)}K tokens · ${files.length} files · ${fw?"FRAMEWORK":"STATIC"}`);
  console.log(`  target ${kind==="framework"?"~":"<"}${target}K → ${r.tokens/1000 < target || kind==="framework" ? "✅" : "❌ OVER"}`);
  console.log(`  reply: ${r.reply}`);
}

if (arg.startsWith("refactor:")) {
  const wsid = arg.split(":")[1];
  const REQUEST = process.env.REQUEST || "Refactor for maintainability: extract shared UI into reusable components, centralize all data access behind a single module, add consistent error handling on every data call, and tidy naming across the codebase.";
  const filesBefore = (await J(await fetch(`${B}/api/workspaces/${wsid}/files`, { headers:{ cookie: ck() } })))?.data?.files ?? [];
  console.log(`\n[REFACTOR] ws=${wsid} · ${filesBefore.length} files before`);
  const start = new Date().toISOString(); const t0 = Date.now();
  const post = await fetch(`${B}/api/workspaces/${wsid}/refactor`, { method:"POST", headers:{ "content-type":"application/json", cookie: ck() }, body: JSON.stringify({ message: REQUEST }) });
  const pj = await J(post);
  if (post.status !== 200 || !pj?.data?.id) { console.log("❌ start failed", post.status, JSON.stringify(pj).slice(0,160)); await pool.end(); process.exit(1); }
  const jobId = pj.data.id; let last="";
  while (Date.now()-t0 < 560000) {
    await new Promise(r=>setTimeout(r,4000));
    const b = (await J(await fetch(`${B}/api/workspaces/${wsid}/jobs/${jobId}`, { headers:{ cookie: ck() } })))?.data;
    if (!b) continue;
    const sig = `${b.status}|`+(b.steps||[]).map(s=>`${s.label}:${s.state}`).join(",");
    if (sig!==last){ last=sig; console.log(`  [${((Date.now()-t0)/1000).toFixed(0)}s] ${b.status} board=~${Math.round((b.tokensSpent||0)/1000)}K · `+(b.steps||[]).map(s=>`${s.kind}:${s.state}`).join(" ")); }
    if (["done","error","canceled"].includes(b.status)) {
      const u = await sumTokens(wsid, start);
      console.log(`\n[REFACTOR FINAL] ${b.status} · ${((Date.now()-t0)/1000).toFixed(0)}s`);
      console.log(`  board tokensSpent=~${Math.round((b.tokensSpent||0)/1000)}K · AiUsageEvent=${(Number(u.t)/1000).toFixed(1)}K (${u.n} turns)`);
      console.log(`  ${(b.written||[]).length} files written · target <400K → ${Number(u.t)/1000 < 400 ? "✅" : "❌ OVER"}`);
      break;
    }
  }
}
await pool.end(); process.exit(0);
