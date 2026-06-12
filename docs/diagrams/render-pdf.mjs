// Renders docs/diagrams/*.html to PDF using the system Edge browser
// (Playwright channel "msedge" — no browser download needed).
// Usage: node docs/diagrams/render-pdf.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "chat-context-engine.html");
const out = path.join(dir, "chat-context-engine.pdf");

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
await page.goto("file:///" + src.replace(/\\/g, "/"));
await page.pdf({ path: out, format: "A4", landscape: true, printBackground: true });
await browser.close();
console.log("wrote", out);
