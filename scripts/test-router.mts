// Dynamic-only: every app is a real (dynamic) app. The router picks the LIGHTEST
// dynamic stack — a Vite SPA by default, a small server for APIs, Next.js only for
// genuine full-stack. Static is never the default (last-resort fallback only).
//   npx tsx scripts/test-router.mts
import { intentRoute } from "../src/lib/templates/route-intent.js";

const has = (id: string) =>
  ["static-web", "nextjs-app", "express-api", "flask-api", "django-app", "vite-spa"].includes(id);

let pass = 0, fail = 0;
const ok = (c: boolean, label: string) => { c ? (pass++, console.log("  PASS", label)) : (fail++, console.log("  FAIL", label)); };
const expect = (prompt: string, wanted: string) => {
  const got = intentRoute(prompt, has);
  ok(got === wanted, `"${prompt}" → ${got} (wanted ${wanted})`);
};

// Default → a lightweight Vite SPA (a real dynamic app, not static HTML).
expect("make me a simple working calendar app", "vite-spa");
expect("a todo app", "vite-spa");
expect("an analytics dashboard with charts", "vite-spa");
expect("an online store front", "vite-spa"); // storefront UI ≠ real commerce
expect("a chat app", "vite-spa"); // chat UI ≠ real-time backend
expect("a recipe app", "vite-spa");
expect("portfolio site", "vite-spa");
expect("a react app", "vite-spa");
expect("a single page app", "vite-spa");

// Genuine full-stack → Next.js (earned, not default).
expect("a todo app with user accounts and a database", "nextjs-app");
expect("a saas with stripe billing", "nextjs-app");
expect("an ecommerce store with checkout", "nextjs-app");
expect("build a next.js app", "nextjs-app");
expect("a react dashboard with login", "nextjs-app"); // login beats react→vite

// API / backend-first → a lightweight server, not Next.js.
expect("a rest api for tasks", "express-api");
expect("an express backend", "express-api");
expect("a flask api", "flask-api");
expect("a python api for products", "flask-api");

// Fallback: if vite-spa is unavailable, static still renders so the user isn't stuck.
{
  const hasNoVite = (id: string) => ["static-web", "nextjs-app", "express-api"].includes(id);
  const got = intentRoute("a recipe app", hasNoVite);
  ok(got === "static-web", `no-vite fallback: "a recipe app" → ${got} (wanted static-web)`);
}

console.log(`\n=== router intent: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
