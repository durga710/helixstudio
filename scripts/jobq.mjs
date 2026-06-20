import pg from "pg";
const wsid = process.argv[2];
const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, max: 1 });
const c = await pool.connect();
const r = await c.query(`SELECT id, status, job FROM "WorkspaceTask" WHERE "workspaceId"=$1 ORDER BY "createdAt" DESC LIMIT 1`, [wsid]);
const row = r.rows[0];
if (!row) console.log("no task");
else {
  const j = row.job || {};
  console.log("task.status:", row.status, "| job.status:", j.status, "| tokensSpent:", Math.round((j.tokensSpent||0)/1000)+"K");
  console.log("steps:", (j.steps||[]).map(s=>`${s.kind}:${s.status||s.state}`).join("  "));
  const u = await c.query(`SELECT COALESCE(SUM(tokens),0) t, COUNT(*) n FROM "AiUsageEvent" WHERE "workspaceId"=$1 AND "createdAt" > now() - interval '25 minutes'`, [wsid]);
  console.log("AiUsageEvent(25min):", (Number(u.rows[0].t)/1000).toFixed(1)+"K", `(${u.rows[0].n} turns)`);
}
c.release(); await pool.end();
