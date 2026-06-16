// Verifies the template intent router picks the LIGHTEST stack that fits — static
// by default, a small server for APIs, vite for SPAs, Next.js only for genuine
// full-stack. (No more "Next.js for everything".)
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

// Default static — the cheapest, instant path (covers most apps).
expect("make me a simple working calendar app", "static-web");
expect("a todo app", "static-web");
expect("an analytics dashboard with charts", "static-web");
expect("an online store front", "static-web"); // storefront UI ≠ real commerce
expect("a chat app", "static-web"); // chat UI ≠ real-time backend
expect("a recipe app", "static-web");
expect("portfolio site", "static-web");

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

// Explicit client SPA / React → vite (lighter than Next).
expect("a react app", "vite-spa");
expect("a single page app", "vite-spa");

console.log(`\n=== router intent: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
