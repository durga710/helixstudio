// Verifies the template intent router sends "simple <thing> app" to the INSTANT
// static starter, and only escalates to a framework on a real dynamic signal.
//   npx tsx scripts/test-router.mts
import { intentRoute } from "../src/lib/templates/route-intent.js";

// All our template ids exist in this test.
const has = (id: string) =>
  ["static-web", "nextjs-app", "express-api", "flask-api", "django-app"].includes(id);

let pass = 0, fail = 0;
const ok = (c: boolean, label: string) => { c ? (pass++, console.log("  PASS", label)) : (fail++, console.log("  FAIL", label)); };

const expect = (prompt: string, wanted: string) => {
  const got = intentRoute(prompt, has);
  ok(got === wanted, `"${prompt}" → ${got} (wanted ${wanted})`);
};

// Simple apps → instant static (the calendar bug).
expect("make me a simple working calendar app", "static-web");
expect("a todo app", "static-web");
expect("build a habit tracker app", "static-web");
expect("an analytics dashboard with charts", "static-web");
expect("portfolio site", "static-web");
expect("a recipe app", "static-web");

// Genuine dynamic needs → framework.
expect("a todo app with user accounts and a database", "nextjs-app");
expect("a saas platform with login and stripe billing", "nextjs-app");
expect("build a next.js app", "nextjs-app");
expect("a marketplace with checkout", "nextjs-app");
expect("a chat app", "nextjs-app");

// Explicit non-Next frameworks still route correctly.
expect("a flask api", "flask-api");
expect("an express backend", "express-api");

console.log(`\n=== router intent: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
