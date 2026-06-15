// Self-contained headless smoke test for the AI-Lab studios (client-only, ssr:false).
//
//   npm run test:studios                 # against http://localhost:3000
//   BASE_URL=http://localhost:3100 npm run test:studios
//
// It logs itself in through the demo account (no external cookie file), loads
// each studio in Chromium, waits for the real client component to mount, fails
// on ANY console/page error, and drives one real interaction per studio.
//
// Studios run continuous CSS pulse animations which defeat Playwright's pointer
// auto-wait, so we inject a stylesheet that disables animation/transition once
// the component has mounted — that lets us use faithful, real .click() calls.
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const DEMO = { email: "demo@helixstudio.org", password: "helix-demo" }; // public demo account

// --- tiny cookie jar over fetch, so we can perform the Auth.js credentials flow ---
const jar = new Map();
function absorb(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(";")[0];
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function login() {
  const r1 = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader() } });
  absorb(r1);
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, ...DEMO, callbackUrl: `${BASE}/lab` }),
    redirect: "manual",
  });
  absorb(r2);
  const hasSession = [...jar.keys()].some((k) => k.endsWith("authjs.session-token"));
  if (!hasSession) throw new Error("login failed — no session cookie returned (is the server up and the demo account enabled?)");
}

async function preflight() {
  try {
    await fetch(`${BASE}/api/auth/csrf`, { signal: AbortSignal.timeout(4000) });
  } catch {
    console.error(`No server reachable at ${BASE}.\nStart one first, e.g.  npm run build && npx next start -p 3000  (or pass BASE_URL).`);
    process.exit(2);
  }
}

const STUDIOS = [
  { id: "cluster", mount: /Locked in:/i },
  { id: "tree", mount: /Best cut|split/i },
  { id: "regression", mount: /How bendy|Fit/i },
  { id: "network", mount: /Hidden neuron|Train/i },
];

const KILL_ANIM = `*,*::before,*::after{animation:none!important;transition:none!important}`;

await preflight();
await login();

const browser = await chromium.launch();
// Tall viewport so every studio's controls sit on-screen — real clicks need the
// target in the viewport, and the control rows render below an 900px fold.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1700 } });
const host = new URL(BASE).hostname;
await ctx.addCookies(
  [...jar].map(([name, value]) => ({ name, value, domain: host, path: "/", httpOnly: false, secure: BASE.startsWith("https") })),
);

let anyFail = false;
for (const s of STUDIOS) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  let mounted = false, interaction = "";
  try {
    await page.goto(`${BASE}/lab/studio/${s.id}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForFunction((re) => new RegExp(re, "i").test(document.body.innerText), s.mount.source, { timeout: 20000 });
    mounted = true;
    await page.addStyleTag({ content: KILL_ANIM }); // make real clicks actionable

    // Dismiss the first-visit intro overlay (a fixed z-50 panel that otherwise
    // intercepts every click on the studio controls underneath it) — exactly as
    // a real user does by pressing "Start building".
    const intro = page.getByRole("button", { name: "Start building", exact: true });
    if (await intro.count()) { await intro.click({ timeout: 6000 }); await intro.waitFor({ state: "hidden", timeout: 6000 }); }

    const svgCircles = await page.locator("svg circle").count();
    const buttons = await page.locator("button").count();
    interaction = `${svgCircles} svg-circles, ${buttons} buttons`;

    const click = async (name) => {
      const b = page.getByRole("button", { name, exact: true });
      if (await b.count()) { await b.first().click({ timeout: 6000 }); return true; }
      return false;
    };

    if (s.id === "cluster") {
      if (await click("Guess game")) {
        await page.waitForFunction(() => /Tap the group/i.test(document.body.innerText), null, { timeout: 5000 });
        interaction += " · guess-game opened";
      }
      if (await click("4")) { await page.waitForTimeout(150); interaction += " · K=4"; }
    } else if (s.id === "network") {
      if (await click("Train")) { await page.waitForTimeout(1500); interaction += " · trained"; }
    } else if (s.id === "regression") {
      if (await click("Fit")) {
        await page.waitForFunction(() => /Error on new points|off by/i.test(document.body.innerText), null, { timeout: 5000 });
        interaction += " · fit";
      }
    } else if (s.id === "tree") {
      if (await click("Best cut")) { await page.waitForTimeout(250); interaction += " · cut"; }
    }
    await page.waitForTimeout(250); // let any post-click error surface
  } catch (e) {
    interaction = "ERROR: " + e.message.split("\n")[0];
  }

  const ok = mounted && errors.length === 0;
  if (!ok) anyFail = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${s.id.padEnd(11)} mounted=${mounted}  ${interaction}`);
  for (const er of errors.slice(0, 4)) console.log("        " + er);
  await page.close();
}

await browser.close();
console.log(anyFail ? "\n=== SOME STUDIOS FAILED ===" : "\n=== ALL STUDIOS PASSED ===");
process.exit(anyFail ? 1 : 0);
