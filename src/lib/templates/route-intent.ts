/**
 * Pure (server-only-free) intent routing for the template picker — extracted so
 * it can be unit-tested. Decides a starter from the prompt's INTENT before any
 * keyword scoring or model call. See router.ts for the full classifier.
 */

// Dynamic-only: every app builds as a real (dynamic) app. The default is the
// LIGHTEST dynamic stack — a Vite SPA — not static HTML. Static is kept in the
// registry only as a last-resort fallback (see intentRoute) so previews never
// hard-break if vite-spa is somehow unavailable.
export const DEFAULT_ID = "vite-spa";

/** Explicit framework mention → that framework's starter (strongest signal). */
const FRAMEWORK_HINTS: { re: RegExp; id: string }[] = [
  { re: /\b(next\.?js|nextjs)\b/, id: "nextjs-app" },
  { re: /\bdjango\b/, id: "django-app" },
  { re: /\b(flask|fastapi)\b/, id: "flask-api" },
  { re: /\b(express|node\.?js|nodejs)\b/, id: "express-api" },
  // bare "react"/"vite"/"spa" → a lightweight client SPA, NOT a full Next.js app
  // (unless a full-stack signal below also fires).
  { re: /\b(vite|spa)\b/, id: "vite-spa" },
];

/**
 * GENUINE full-stack needs — real server data, accounts, payments, real-time.
 * These (and only these) warrant the heavy Next.js skeleton. Everything softer
 * ("store", "chat", "dashboard", "social", "cms"…) is built lighter (static or a
 * small server) — Next.js is the most expensive stack to build/run/maintain, so
 * it must be EARNED, not the default.
 */
const FULLSTACK_INTENT = [
  "login", "log in", "sign in", "signup", "sign up", "auth", "authentication",
  "account", "accounts", "user accounts", "saas",
  "database", "db", "postgres", "prisma", "sql", "mongodb", "persist", "persistence",
  "real-time", "realtime", "websocket", "multiplayer", "multi-user", "multi user",
  "payment", "payments", "checkout", "stripe", "billing", "subscription", "ecommerce", "e-commerce",
];

/** API/backend-first → a LIGHTWEIGHT server (express/flask/django), not Next.js. */
const API_INTENT = ["api", "rest", "rest api", "graphql", "backend", "endpoint", "endpoints", "crud", "microservice", "webhook"];

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 1);
}

function countIntent(lower: string, words: Set<string>, list: string[]): number {
  let n = 0;
  for (const kw of list) {
    if (kw.includes(" ") || kw.includes("-")) {
      if (lower.includes(kw)) n++;
    } else if (words.has(kw)) {
      n++;
    }
  }
  return n;
}

/**
 * Resolve a starter from intent, LIGHTEST-FIRST. `has(id)` reports whether a
 * template id exists. Dynamic-only order: explicit framework → genuine full-stack
 * (Next.js) → API/backend (express/flask/django) → everything else → a lightweight
 * Vite SPA (the default). Static is only a last-resort fallback if vite is missing.
 */
export function intentRoute(prompt: string, has: (id: string) => boolean): string | null {
  const lower = prompt.toLowerCase();
  const words = new Set(tokenize(prompt));
  const hit = (list: string[]) => countIntent(lower, words, list) > 0;

  // 1. Explicit framework name wins.
  for (const h of FRAMEWORK_HINTS) {
    if (h.re.test(lower) && has(h.id)) return h.id;
  }
  // 2. Genuine full-stack need (auth/data/payments/real-time) → Next.js.
  if (hit(FULLSTACK_INTENT) && has("nextjs-app")) return "nextjs-app";
  // 3. API/backend-first → a lightweight server. Python hint → Flask, else Express.
  if (hit(API_INTENT)) {
    if (/\b(python|flask|fastapi)\b/.test(lower) && has("flask-api")) return "flask-api";
    if (has("express-api")) return "express-api";
  }
  // 4. Everything else → a lightweight Vite SPA (the dynamic-only default). Covers
  //    calculators, trackers, dashboards, tools — a real app, far lighter than Next.
  if (has(DEFAULT_ID)) return DEFAULT_ID;
  // 5. Last-resort fallback only: if vite-spa is somehow unavailable, static still
  //    renders inline so the user isn't left with nothing.
  if (has("static-web")) return "static-web";
  return null;
}
