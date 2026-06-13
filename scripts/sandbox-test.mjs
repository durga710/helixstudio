/** Smoke-test the template-refresh sandbox flow end-to-end, locally, using the
 *  Vercel OIDC token. Proves: create sandbox → run an official CLI → install →
 *  build-gate → read files back. Usage: node scripts/sandbox-test.mjs */
import { config } from "dotenv";
// Fresh OIDC token from `vercel env pull` (12h tokens expire); fall back to the
// checked-in oidc file. Pass a path as argv[2] to override.
config({ path: process.argv[2] || "/tmp/ve-throwaway.txt" });
config({ path: ".env.vercel-oidc" });
config({ path: ".env.local" });

const { Sandbox } = await import("@vercel/sandbox");

const log = (s) => console.log(s);
const t0 = Date.now();
const elapsed = () => `${Math.round((Date.now() - t0) / 1000)}s`;

log(`[${elapsed()}] creating sandbox…`);
let sbx;
try {
  sbx = await Sandbox.create({ runtime: "node24", timeout: 10 * 60 * 1000, resources: { vcpus: 4 } });
} catch (e) {
  console.error("SANDBOX_CREATE_FAILED:", e?.message || e);
  process.exit(1);
}
log(`[${elapsed()}] ✓ sandbox ready`);

async function run(cmd, timeoutMs = 360_000) {
  log(`[${elapsed()}] $ ${cmd}`);
  const r = await sbx.runCommand({ cmd: "sh", args: ["-c", cmd], timeoutMs });
  const [o, e] = await Promise.all([r.stdout(), r.stderr()]);
  const tail = (o + (e ? "\n" + e : "")).trim().split("\n").slice(-8).join("\n");
  if (tail) log(tail);
  log(`[${elapsed()}] [exit ${r.exitCode}]`);
  return r.exitCode;
}

try {
  await run("node -v && npm -v", 30_000);
  // Fastest CLI template: Vite react-ts.
  await run("cd /vercel/sandbox && npm create vite@latest t -- --template react-ts", 180_000);
  await run("cd /vercel/sandbox/t && npm install --no-audit --no-fund", 360_000);
  const build = await run("cd /vercel/sandbox/t && npm run build", 360_000);
  log(`[${elapsed()}] build exit = ${build} (0 = green)`);
  // Read files back, like the refresh does.
  const r = await sbx.runCommand({
    cmd: "sh",
    args: ["-c", "cd /vercel/sandbox/t && find . -type f -not -path './node_modules/*' | sed 's|^\\./||' | sort"],
  });
  const files = (await r.stdout()).split("\n").filter(Boolean);
  log(`[${elapsed()}] read back ${files.length} files, e.g.: ${files.slice(0, 8).join(", ")}`);
  const pkg = await sbx.readFileToBuffer({ path: "/vercel/sandbox/t/package.json" }).catch(() => null);
  log(`[${elapsed()}] package.json readable: ${pkg ? "yes (" + pkg.length + " bytes)" : "NO"}`);
  log(`\nRESULT: ${build === 0 && files.length > 5 && pkg ? "PASS ✓ — the batch job's sandbox flow works" : "FAIL"}`);
} catch (e) {
  console.error("ERROR:", e?.message || e);
} finally {
  await sbx.stop().catch(() => {});
  log(`[${elapsed()}] sandbox stopped`);
}
