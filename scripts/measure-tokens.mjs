// Measure real token cost: a small static build + a single-file change.
//   node --env-file=.env.local scripts/measure-tokens.mjs
import pg from "pg";
const B = (process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const DEMO = { email: "demo@helixstudio.org", password: "helix-demo" };
const jar = new Map();
const absorb = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const p=c.split(";")[0],i=p.indexOf("="); const n=p.slice(0,i).trim(),v=p.slice(i+1).trim(); if(v==="")jar.delete(n);else jar.set(n,v);} };
const ck = () => [...jar].map(([k,v])=>`${k}=${v}`).join("; ");
const J = (r) => r.json();

const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, max: 1 });
const tokensSince = async (wsid, sinceIso) => {
  const c = await pool.connect();
  try {
    const r = await c.query(`SELECT COALESCE(SUM(tokens),0) AS t, COUNT(*) AS n, STRING_AGG(DISTINCT kind, ',') AS kinds FROM "AiUsageEvent" WHERE "workspaceId"=$1 AND "createdAt" > $2`, [wsid, sinceIso]);
    return r.rows[0];
  } finally { c.release(); }
};

async function turn(wsid, message, mode = "build", verify = true) {
  const start = new Date().toISOString();
  const t0 = Date.now();
  const res = await fetch(`${B}/api/workspaces/${wsid}/chat`, { method:"POST", headers:{ "content-type":"application/json", cookie: ck() }, body: JSON.stringify({ message, mode, verify }) });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf=""; let final=null;
  outer: for(;;){ const {done,value}=await reader.read(); if(done)break; buf+=dec.decode(value,{stream:true}); let nl; while((nl=buf.indexOf("\n"))>=0){ const line=buf.slice(0,nl).trim(); buf=buf.slice(nl+1); if(!line)continue; let e; try{e=JSON.parse(line);}catch{continue;} if(e.type==="final"){final=e;break outer;} if(e.type==="error"){final=e;break outer;} if(Date.now()-t0>200000)break outer; } }
  await new Promise(r=>setTimeout(r,1500)); // let usage rows flush
  const usage = await tokensSince(wsid, start);
  return { secs:((Date.now()-t0)/1000).toFixed(0), reply: (final?.summary||final?.text||final?.error||"").slice(0,90), tokens:Number(usage.t), events:Number(usage.n), kinds: usage.kinds };
}

// login
const csrf = (await J(await fetch(`${B}/api/auth/csrf`).then(r=>{absorb(r);return r;}))).csrfToken;
absorb(await fetch(`${B}/api/auth/callback/credentials`, { method:"POST", headers:{ "content-type":"application/x-www-form-urlencoded", cookie: ck() }, body:new URLSearchParams({ csrfToken:csrf, ...DEMO, callbackUrl:`${B}/` }), redirect:"manual" }));
const sess = await J(await fetch(`${B}/api/auth/session`, { headers:{ cookie: ck() } }));
console.log("auth:", sess?.user?.email);

// fresh small project
const created = await J(await fetch(`${B}/api/workspaces`, { method:"POST", headers:{ "content-type":"application/json", cookie: ck() }, body: JSON.stringify({ mode:"SCRATCH", name:"Token Measure", buildKind:"app" }) }));
const wsid = created?.data?.id;
console.log("workspace:", wsid);

console.log("\n=== 1) small build: 'a simple calendar app' ===");
const b = await turn(wsid, "make me a simple calendar app");
const files = (await J(await fetch(`${B}/api/workspaces/${wsid}/files`, { headers:{ cookie: ck() } })))?.data?.files ?? [];
const isStatic = !files.some(f=>/package\.json$/.test(f.path));
console.log(`build: ${b.secs}s · ${(b.tokens/1000).toFixed(1)}K tokens (${b.events} turns: ${b.kinds}) · ${files.length} files · ${isStatic?"STATIC ✅":"FRAMEWORK"}`);
console.log("  reply:", b.reply);

console.log("\n=== 2) single-file change: 'make the header blue, title \"My Calendar\"' ===");
const c = await turn(wsid, "change the page header text to 'My Calendar' and make the header blue");
console.log(`change: ${c.secs}s · ${(c.tokens/1000).toFixed(1)}K tokens (${c.events} turns: ${c.kinds})`);
console.log("  reply:", c.reply);

console.log(`\n=== SUMMARY ===\nsmall build : ${(b.tokens/1000).toFixed(1)}K  (${isStatic?"static":"framework"}, ${files.length} files)\none-file edit: ${(c.tokens/1000).toFixed(1)}K`);
await pool.end();
process.exit(0);
