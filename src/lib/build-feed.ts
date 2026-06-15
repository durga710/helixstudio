/**
 * Turns the file paths of a freshly-injected starter template into a friendly,
 * paced "construction feed" — present-tense lines like "Building the home page"
 * or "Wiring up the navigation" that play in the chat while the agent customizes
 * the skeleton in the background.
 *
 * The files are REAL — the template engine just wrote them — so the feed is
 * honest: it narrates the actual scaffold in human terms and gives the chat
 * something premium to show, so a long model turn never reads as a frozen
 * loader. Pure, 0-token, and client-safe (no server-only imports).
 */

const pretty = (s: string) =>
  s
    .replace(/\.[a-z]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** A human page name from a route/page/html file, or null if it isn't one. */
function pageName(path: string): string | null {
  let m = path.match(/(?:^|\/)app\/(.+?)\/page\.(?:t|j)sx?$/i);
  if (m) return pretty(m[1].split("/").pop()!);
  if (/(?:^|\/)app\/page\.(?:t|j)sx?$/i.test(path)) return "Home";
  m = path.match(/(?:^|\/)pages\/(.+?)\.(?:t|j)sx?$/i);
  if (m) {
    const n = m[1].split("/").pop()!;
    return /^(index|home)$/i.test(n) ? "Home" : pretty(n);
  }
  m = path.match(/(?:^|\/)templates\/(.+?)\.html?$/i);
  if (m) {
    const n = m[1].split("/").pop()!;
    return /^(index|home|base)$/i.test(n) ? "Home" : pretty(n);
  }
  m = path.match(/(?:^|\/)([a-z0-9_-]+)\.html?$/i);
  if (m) return /^index$/i.test(m[1]) ? "Home" : pretty(m[1]);
  return null;
}

/** A component name from a components/ file, or null. */
function componentName(path: string): string | null {
  const m = path.match(/(?:^|\/)components?\/(?:.*\/)?([A-Za-z0-9_-]+)\.(?:t|j)sx?$/);
  if (!m) return null;
  if (/^(index|page|layout)$/i.test(m[1])) return null;
  return pretty(m[1]);
}

/**
 * An ordered list of friendly "building …" lines derived from the scaffold's
 * real files (+ the idea/kind for flavor). Roughly 6–14 lines — enough to pace
 * the chat through a typical build without repeating.
 */
export function buildFeedLabels(
  files: string[],
  opts: { idea?: string; kind?: "app" | "game" } = {},
): string[] {
  const paths = (files ?? []).filter(Boolean);
  const lower = paths.map((p) => p.toLowerCase());
  const some = (re: RegExp) => lower.some((p) => re.test(p));
  const out: string[] = [];
  const add = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };

  if (opts.kind === "game") {
    add("Setting up the game world");
    add("Adding the player");
    add("Spawning the enemies and pickups");
    add("Wiring up the controls");
    add("Adding the score and on-screen UI");
    add("Tuning the gameplay");
    add("Bringing it all together");
    return out;
  }

  add("Laying the foundation");
  if (some(/package\.json|requirements\.txt|go\.mod|gemfile|composer\.json/)) add("Setting up the dependencies");
  if (some(/tailwind|postcss|globals?\.css|theme|tokens\.css|(^|\/)styles?\//)) add("Applying the design system");
  if (some(/(^|\/)(app\/layout|_app|_document|base\.html|layout\.(t|j)sx?)/)) add("Building the app skeleton");

  // Pages — home first, then the rest, capped so the feed stays tight.
  const pages: string[] = [];
  for (const p of paths) {
    const n = pageName(p);
    if (n && !pages.includes(n)) pages.push(n);
  }
  pages.sort((a, b) => (a === "Home" ? -1 : b === "Home" ? 1 : 0));
  for (const n of pages.slice(0, 5)) add(`Building the ${n.toLowerCase()} page`);

  if (some(/auth|login|sign[\s-]?in|sign[\s-]?up|session/)) add("Adding the login flow");
  if (some(/(^|\/)(nav|sidebar|header|navbar|topbar)/)) add("Wiring up the navigation");

  // A couple of named components, for texture.
  const comps: string[] = [];
  for (const p of paths) {
    const n = componentName(p);
    if (n && !comps.includes(n)) comps.push(n);
  }
  for (const n of comps.slice(0, 3)) add(`Crafting the ${n} component`);

  if (some(/(^|\/)(api|routes?|server|controllers?)\//) || some(/(^|\/)route\.(t|j)s$/)) add("Setting up the API");
  if (some(/(^|\/)(models?|prisma|schema)/)) add("Modeling the data");

  add("Refining the layout");
  add("Bringing it all together");
  return out;
}

/**
 * Generic "still working" lines to cycle once the file-derived feed is spent but
 * the agent is still customizing — keeps the chat alive without claiming a
 * specific file. Present-tense, premium, never alarming.
 */
export const FEED_HOLDING_LINES = [
  "Refining the details",
  "Tightening up the styling",
  "Filling in the content",
  "Wiring the pieces together",
  "Adding the finishing touches",
];
