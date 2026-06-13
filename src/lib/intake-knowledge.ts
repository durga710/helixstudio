/**
 * Curation knowledge base — the hand-curated lookup data that makes the intake
 * engine's FREE rule pass genuinely smart (see src/lib/intake.ts). Three small
 * tables, all keyword-searchable, no AI / no embeddings:
 *
 *   ARCHETYPES          — app type → recommended stack, default features, and
 *                         the single best clarifying question.
 *   SYNONYMS            — phrasing variants → a canonical token, so matching is
 *                         robust ("trello" → kanban, "signin" → auth).
 *   FEATURE_IMPLICATIONS — a feature → the features it implies, so the brief
 *                         auto-completes ("payments" → needs auth + a database).
 *
 * Curated, version-controlled, a few KB. B (the AI call) stays the catch-all
 * for anything not in these tables.
 */

export interface Archetype {
  id: string;
  label: string;
  /** Match terms — multi-word entries are phrase-matched, single words token-matched. */
  keywords: string[];
  /** Friendly recommended stack (a hint, not a hard rule). */
  stack: string;
  /** Default features to fold into the build brief. */
  features: string[];
  /** The single highest-value clarifying question (asked free, instead of AI). */
  question?: { key: string; text: string; options?: string[] };
}

export const ARCHETYPES: Archetype[] = [
  { id: "kanban", label: "Kanban / task board", keywords: ["kanban", "board", "task board", "trello"], stack: "Next.js", features: ["drag-and-drop", "persistence", "boards & cards"], question: { key: "scope", text: "Should boards be shareable with others, or just yours?", options: ["Just mine", "Shareable"] } },
  { id: "todo", label: "To-do app", keywords: ["todo", "to-do", "task list", "checklist"], stack: "Next.js", features: ["add & complete tasks", "persistence"] },
  { id: "blog", label: "Blog", keywords: ["blog", "posts", "articles"], stack: "Next.js", features: ["posts", "markdown content"], question: { key: "authors", text: "Who writes the posts — just you, or multiple authors?", options: ["Just me", "Multiple authors"] } },
  { id: "landing", label: "Landing / waitlist page", keywords: ["landing", "waitlist", "coming soon", "marketing page"], stack: "Static site", features: ["hero section", "email signup"] },
  { id: "portfolio", label: "Portfolio site", keywords: ["portfolio", "personal site", "resume", "cv"], stack: "Static site", features: ["project gallery", "about section"] },
  { id: "dashboard", label: "SaaS dashboard", keywords: ["dashboard", "saas", "admin panel", "analytics"], stack: "Next.js", features: ["user authentication", "a dashboard", "charts"], question: { key: "tiers", text: "One plan, or free + paid tiers?", options: ["One plan", "Free + paid"] } },
  { id: "marketplace", label: "Marketplace", keywords: ["marketplace", "buyers", "sellers", "listings"], stack: "Next.js", features: ["user authentication", "listings", "payments"], question: { key: "sides", text: "Two sides — buyers and sellers?", options: ["Yes, two sides", "Single audience"] } },
  { id: "ecommerce", label: "Online store", keywords: ["shop", "store", "ecommerce", "e-commerce", "cart", "products"], stack: "Next.js", features: ["product catalog", "cart", "payments"], question: { key: "pay", text: "Take real payments (Stripe), or just a catalog for now?", options: ["Stripe payments", "Catalog only"] } },
  { id: "crm", label: "CRM", keywords: ["crm", "contacts", "leads", "pipeline"], stack: "Next.js", features: ["user authentication", "a database", "a dashboard"] },
  { id: "booking", label: "Booking / scheduling", keywords: ["booking", "appointment", "schedule", "reservation", "calendar"], stack: "Next.js", features: ["calendar", "bookings", "a database"], question: { key: "who", text: "Clients booking time with you, or peer-to-peer?", options: ["Clients → me", "Peer-to-peer"] } },
  { id: "chat", label: "Chat / messaging", keywords: ["chat", "messaging", "dm"], stack: "Next.js", features: ["user authentication", "realtime updates", "messages"] },
  { id: "social", label: "Social app", keywords: ["social", "feed", "follow", "timeline"], stack: "Next.js", features: ["user authentication", "feed", "profiles"] },
  { id: "forum", label: "Forum / community", keywords: ["forum", "community", "threads", "discussion"], stack: "Next.js", features: ["user authentication", "threads", "comments"] },
  { id: "api", label: "REST API / backend", keywords: ["api", "rest", "backend", "endpoint", "express"], stack: "Express", features: ["REST endpoints", "a database"], question: { key: "runtime", text: "Node or Python for the backend?", options: ["Node (Express)", "Python (Flask)"] } },
  { id: "flask-api", label: "Python API", keywords: ["flask", "python api", "django"], stack: "Flask", features: ["REST endpoints", "a database"] },
  { id: "notes", label: "Note-taking app", keywords: ["notes", "note-taking", "notebook"], stack: "Next.js", features: ["notes", "persistence", "search & filtering"] },
  { id: "finance", label: "Budget / expense tracker", keywords: ["expense", "budget", "finance", "spending", "split"], stack: "Next.js", features: ["a database", "charts"] },
  { id: "quiz", label: "Quiz / survey / poll", keywords: ["quiz", "trivia", "survey", "poll", "form"], stack: "Next.js", features: ["questions", "results"] },
  { id: "game", label: "Browser game", keywords: ["game", "puzzle", "arcade"], stack: "Static site", features: ["game logic", "canvas rendering"] },
  { id: "recipe", label: "Recipe app", keywords: ["recipe", "cooking", "meals"], stack: "Next.js", features: ["a database", "search & filtering"] },
  { id: "fitness", label: "Fitness / habit tracker", keywords: ["fitness", "workout", "habit", "tracker"], stack: "Next.js", features: ["a database", "charts"] },
  { id: "realestate", label: "Property listings", keywords: ["real estate", "property", "rentals", "apartments"], stack: "Next.js", features: ["listings", "search & filtering", "a database"] },
  { id: "jobs", label: "Job board", keywords: ["job board", "jobs", "careers", "hiring"], stack: "Next.js", features: ["listings", "search & filtering"] },
  { id: "events", label: "Events / RSVP", keywords: ["event", "rsvp", "ticket", "meetup"], stack: "Next.js", features: ["a database", "rsvp"] },
];

/** Variant token → a canonical token used in archetype keywords. */
export const SYNONYMS: Record<string, string> = {
  trello: "kanban", jira: "kanban", todos: "todo", tasklist: "todo",
  signin: "auth", signup: "auth", login: "auth", accounts: "auth", users: "auth",
  ecommerce: "shop", storefront: "shop", checkout: "cart",
  realtime: "chat", messaging: "chat", messages: "chat",
  appointments: "booking", reservations: "booking", scheduling: "schedule",
  weblog: "blog", articles: "blog", cms: "blog",
  analytics: "dashboard", metrics: "dashboard", reports: "dashboard",
  resume: "portfolio", cv: "portfolio",
  community: "forum", discussion: "forum",
  endpoints: "api", graphql: "api", rest: "api",
  budgeting: "budget", expenses: "expense",
  survey: "quiz", poll: "quiz", trivia: "quiz",
};

/** A feature → the features it implies (so the brief auto-completes). */
export const FEATURE_IMPLICATIONS: Record<string, string[]> = {
  payments: ["user authentication", "a database"],
  "user authentication": ["a database"],
  "realtime updates": ["a database", "user authentication"],
  "a dashboard": ["a database"],
  listings: ["a database", "search & filtering"],
  messages: ["a database", "user authentication"],
  feed: ["a database", "user authentication"],
  bookings: ["a database"],
  profiles: ["a database"],
  threads: ["a database", "user authentication"],
};

/** Find the best-matching archetype for an idea, or null. Free, keyword-based. */
export function matchArchetype(idea: string): Archetype | null {
  const lower = idea.toLowerCase();
  const tokens = new Set(lower.split(/[^a-z0-9+]+/).filter((t) => t.length > 1));
  for (const t of Array.from(tokens)) {
    const canon = SYNONYMS[t];
    if (canon) tokens.add(canon);
  }
  let best: { a: Archetype; score: number } | null = null;
  for (const a of ARCHETYPES) {
    let score = 0;
    for (const kw of a.keywords) {
      if (kw.includes(" ") || kw.includes("-")) {
        if (lower.includes(kw)) score += 2;
      } else if (tokens.has(kw)) {
        score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { a, score };
  }
  return best ? best.a : null;
}

/** Expand a feature list with everything those features imply. */
export function applyImplications(features: string[]): string[] {
  const set = new Set(features);
  for (const f of features) for (const imp of FEATURE_IMPLICATIONS[f] ?? []) set.add(imp);
  return Array.from(set);
}
