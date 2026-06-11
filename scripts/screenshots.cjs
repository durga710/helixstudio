const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:3210";
const OUT = "/tmp/shots";
const EXEC = "/tmp/chs/chrome-headless-shell-linux64/chrome-headless-shell";

const SCREENS = [
  ["/", "03-dashboard"],
  ["/editor", "04-editor"],
  ["/analysis", "05-analysis"],
  ["/agents", "06-agents"],
  ["/skills", "07-skills"],
  ["/deployments", "08-deployments"],
  ["/settings", "09-settings"],
  ["/team", "10-team"],
];

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Public pages
  await page.goto(`${BASE}/welcome`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/01-landing.png` });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/02-login.png` });

  // Sign in through the real form
  await page.fill("#email", "demo@helixstudio.org");
  await page.fill("#password", "helix-demo");
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });

  for (const [path, name] of SCREENS) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log("captured", name);
  }

  // Chat with a streamed (mock) response in the editor
  await page.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
  const box = page.locator('textarea[aria-label="Message Helix"]');
  await box.fill("Add rate limiting to the orders API");
  await box.press("Enter");
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/11-editor-chat.png` });
  console.log("captured 11-editor-chat");

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
