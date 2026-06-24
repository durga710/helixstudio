import "server-only";

/**
 * The headless runtime check, as a self-contained CommonJS script that runs IN
 * THE SANDBOX (where a browser can be provisioned). It serves the workspace files,
 * loads the entry HTML in headless Chromium, and fails on an uncaught error or a
 * blank render — catching games/apps that PARSE but crash at runtime. Best-effort:
 * if no browser is available it skips (exit 0), so it never fails a turn on infra.
 *
 * This is the DEEP, on-demand check (the "Verify build" button) — not the cheap
 * per-iteration verify (that's the in-process syntax check). Validated locally with
 * real Chromium; the sandbox chromium provisioning needs a prod pass.
 */
import { isSafeRepoPath } from "@/lib/repo-files";

export const HEADLESS_CHECK_SCRIPT = String.raw`'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
function loadChromium() {
  for (const m of ['playwright-core', 'playwright']) { try { return require(m).chromium; } catch (e) {} }
  return null;
}
const MIME = { '.html':'text/html','.htm':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon' };
(async () => {
  const entry = (process.argv[2] || 'index.html').replace(/^\.?\//, '');
  if (!fs.existsSync(entry)) { console.log('headless: no entry html, skipping'); process.exit(0); }
  const chromium = loadChromium();
  if (!chromium) { console.log('headless: no browser available, skipping'); process.exit(0); }
  const root = process.cwd();
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/' + entry;
      const fp = path.join(root, p);
      if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    } catch (e) { res.writeHead(500); res.end('err'); }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  let browser;
  try { browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=swiftshader'] }); }
  catch (e) { console.log('headless: browser launch failed, skipping (' + e.message + ')'); server.close(); process.exit(0); }
  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('Uncaught error: ' + (e.message || String(e))));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/favicon|net::ERR|Failed to load resource/i.test(t)) errors.push('Console error: ' + t); } });
  let loaded = true;
  try { await page.goto('http://localhost:' + port + '/' + entry, { waitUntil: 'load', timeout: 15000 }); }
  catch (e) { loaded = false; errors.push('Page failed to load: ' + e.message); }
  await page.waitForTimeout(2000);
  let rendered = true;
  if (loaded) { try { rendered = await page.evaluate(() => { const c = document.querySelector('canvas'); if (c && c.width > 0 && c.height > 0) return true; return !!(document.body && (document.body.children.length > 0 || document.body.innerText.trim().length > 0)); }); } catch (e) { rendered = true; } }
  await browser.close().catch(() => {});
  server.close();
  if (errors.length) { console.error('Runtime check found errors:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
  if (loaded && !rendered) { console.error('Runtime check: the page loaded but rendered nothing (blank).'); process.exit(1); }
  console.log('headless: page loaded clean'); process.exit(0);
})();
`;

/** Build the sandbox command that provisions a browser (best-effort) + runs the
 * headless check. Skips gracefully if the browser can't be provisioned. */
export function headlessCheckCommand(entry: string): string {
  const b64 = Buffer.from(HEADLESS_CHECK_SCRIPT, "utf8").toString("base64");
  // SECURITY (C3): `entry` is a workspace file path that gets interpolated into a
  // shell command. isSafeRepoPath permits no shell metacharacters ($ ` \ ' " ; &
  // | etc.), so a path that passes is safe inside the single-quoted arg; anything
  // else falls back to the default entry rather than executing.
  const safeEntry = isSafeRepoPath(entry) ? entry : "index.html";
  return (
    `node -e "require('fs').writeFileSync('/tmp/helix-hc.cjs', Buffer.from('${b64}','base64').toString('utf8'))" && ` +
    `(npm i -D playwright-core >/dev/null 2>&1 || true) && (npx -y playwright install chromium >/dev/null 2>&1 || true) && ` +
    `node /tmp/helix-hc.cjs '${safeEntry}'`
  );
}
