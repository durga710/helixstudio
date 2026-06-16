/**
 * Pure (server-only-free) intent routing for the template picker — extracted so
 * it can be unit-tested. Decides a starter from the prompt's INTENT before any
 * keyword scoring or model call. See router.ts for the full classifier.
 */

export const DEFAULT_ID = "static-web";

/** Explicit framework mention → that framework's starter (strongest signal). */
const FRAMEWORK_HINTS: { re: RegExp; id: string }[] = [
  { re: /\b(next\.?js|nextjs)\b/, id: "nextjs-app" },
  { re: /\breact\b/, id: "nextjs-app" },
  { re: /\bdjango\b/, id: "django-app" },
  { re: /\bflask\b/, id: "flask-api" },
  { re: /\b(express|node\.?js|nodejs)\b/, id: "express-api" },
];

/**
 * Words that signal a genuinely DYNAMIC need — server state, accounts, data
 * persistence, payments, real-time — which actually warrant a framework
 * (nextjs-app). Deliberately NOT here: "app", "calendar", "todo", "dashboard",
 * "tracker", "scheduler", etc. Those are perfectly good as an INSTANT static app
 * that renders in the live preview with no run step — forcing them onto a heavy
 * Next.js skeleton just made "simple calendar app" show a blank preview until the
 * user ran a cloud sandbox. Default to static; escalate only on a real signal.
 */
const DYNAMIC_INTENT = [
  "saas", "platform", "portal",
  "login", "log in", "signup", "sign up", "sign in", "auth", "authentication",
  "account", "accounts", "admin panel", "admin dashboard",
  "database", "backend", "server-side", "api", "rest api", "graphql", "crud",
  "real-time", "realtime", "multiplayer", "multi-user", "multi user",
  "payment", "payments", "checkout", "stripe", "billing", "subscription",
  "ecommerce", "e-commerce", "marketplace", "store", "shop", "cart",
  "cms", "crm", "chat", "messaging", "messenger", "social network", "social media",
];

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
 * Resolve a starter from intent. `has(id)` reports whether a template id exists.
 * Returns null only when even the static default is missing (→ keyword scoring).
 */
export function intentRoute(prompt: string, has: (id: string) => boolean): string | null {
  const lower = prompt.toLowerCase();
  for (const h of FRAMEWORK_HINTS) {
    if (h.re.test(lower) && has(h.id)) return h.id;
  }
  const words = new Set(tokenize(prompt));
  const dynamicHits = countIntent(lower, words, DYNAMIC_INTENT);
  // A real dynamic need (accounts, data, payments, real-time…) earns a framework.
  if (dynamicHits > 0 && has("nextjs-app")) return "nextjs-app";
  // Everything else — including a generic "app", a calendar, a to-do, a dashboard
  // — builds as an INSTANT static app (renders in the preview with no run step).
  if (has(DEFAULT_ID)) return DEFAULT_ID;
  return null;
}
