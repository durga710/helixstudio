// Measure a single-file edit's token cost on an existing workspace (under the new
// efficiency rule + tiny-edit verify skip).  node --env-file=.env.local scripts/measure-edit.mjs <wsid> "<msg>"
import pg from "pg";
const B = (process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const DEMO = { email: "demo@helixstudio.org", password: "helix-demo" };
const wsid = process.argv[2];
const msg = process.argv[3] || "make the page background a soft light-gray";
const jar = new Map();
const absorb = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const p=c.split(";")[0],i=p.indexOf("="); const n=p.slice(0,i).trim(),v=p.slice(i+1).trim(); if(v==="")jar.delete(n);else jar.set(n,v);} };
const ck = () => [...jar].map(([k,v])=>`${k}=${v}`).join("; ");
const J = (r) => r.json();
const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, max: 1 });

const csrf = (await J(await fetch(`${B}/api/auth/csrf`).then(r=>{absorb(r);return r;}))).csrfToken;
absorb(await fetch(`${B}/api/auth/callback/credentials`, { method:"POST", headers:{ "content-type":"application/x-www-form-urlencoded", cookie: ck() }, body:new URLSearchParams({ csrfToken:csrf, ...DEMO, callbackUrl:`${B}/` }), redirect:"manual" }));

const start = new Date().toISOString(); const t0 = Date.now();
const res = await fetch(`${B}/api/workspaces/${wsid}/chat`, { method:"POST", headers:{ "content-type":"application/json", cookie: ck() }, body: JSON.stringify({ message: msg, mode:"build", verify:true }) });
const reader = res.body.getReader(); const dec = new TextDecoder(); let buf=""; let final=null;
outer: for(;;){ const {done,value}=await reader.read(); if(done)break; buf+=dec.decode(value,{stream:true}); let nl; while((nl=buf.indexOf("\n"))>=0){ const line=buf.slice(0,nl).trim(); buf=buf.slice(nl+1); if(!line)continue; let e; try{e=JSON.parse(line);}catch{continue;} if(e.type==="final"||e.type==="error"){final=e;break outer;} if(Date.now()-t0>120000)break outer; } }
await new Promise(r=>setTimeout(r,1500));
const c = await pool.connect();
const r = await c.query(`SELECT COALESCE(SUM(tokens),0) AS t, COUNT(*) AS n FROM "AiUsageEvent" WHERE "workspaceId"=$1 AND "createdAt" > $2`, [wsid, start]);
c.release();
console.log(`edit "${msg}": ${((Date.now()-t0)/1000).toFixed(0)}s · ${(Number(r.rows[0].t)/1000).toFixed(1)}K tokens`);
console.log("  reply:", (final?.summary||final?.text||final?.error||"").slice(0,100));
await pool.end(); process.exit(0);
