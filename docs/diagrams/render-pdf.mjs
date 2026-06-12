// Renders every docs/diagrams/*.html to a same-named PDF using the system
// Edge browser (Playwright channel "msedge" — no browser download needed).
// Usage: node docs/diagrams/render-pdf.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmls = readdirSync(dir).filter((f) => f.endsWith(".html"));

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
for (const html of htmls) {
  const src = path.join(dir, html);
  const out = src.replace(/\.html$/, ".pdf");
  await page.goto("file:///" + src.replace(/\\/g, "/"));
  await page.pdf({ path: out, format: "A4", landscape: true, printBackground: true });
  console.log("wrote", out);
}
await browser.close();
