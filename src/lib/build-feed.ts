/**
 * The build NARRATION engine. While a new project's starter template is being
 * customized by the agent in the background, the chat plays a friendly,
 * present-tense "building …" feed derived from the REAL injected files — so a
 * long model turn never reads as a frozen loader, and the user always feels a
 * real assistant is talking to them.
 *
 * The hard requirement: it must NEVER look canned. Two users (or the same user
 * across two projects) must not be able to cross-reference and notice identical
 * scripted lines. So every step is a POOL of phrasings and the wording + order
 * are chosen by a PRNG seeded from the workspace id: different across projects,
 * but stable within one (no flicker on re-render, no self-contradiction on
 * revisit). Pure, 0-token, client-safe.
 */

/* --------------------------- seeded variety ------------------------- */

/** A deterministic PRNG from a string seed (FNV-1a → mulberry32). Stable for a
 * given seed, so a project's narration is consistent but unique to it. */
export function seededRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickWith = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

/* ----------------------------- phrase pools ------------------------- */
// Every concept has several phrasings in one warm, first-person voice. The
// seeded rng picks one per line, so no two projects narrate identically.

const POOLS = {
  foundation: ["Laying the foundation", "Getting the groundwork in place", "Setting things up", "Starting the scaffolding", "Spinning up the project"],
  deps: ["Setting up the dependencies", "Pulling in the libraries", "Wiring up the toolchain", "Getting the packages in place"],
  design: ["Applying the design system", "Setting up the theme", "Getting the styling in place", "Laying down the look and feel", "Dialing in the visuals"],
  skeleton: ["Building the app skeleton", "Framing out the layout", "Setting up the shell", "Putting the structure together"],
  auth: ["Adding the login flow", "Wiring up sign-in", "Setting up accounts", "Getting authentication in place"],
  nav: ["Wiring up the navigation", "Connecting the pages", "Setting up the menu", "Linking everything together"],
  api: ["Setting up the API", "Wiring up the backend", "Building the data layer", "Connecting the server side"],
  data: ["Modeling the data", "Setting up the data shapes", "Defining the records", "Getting the data structure ready"],
  refine: ["Refining the layout", "Polishing the details", "Tidying up the spacing", "Smoothing out the edges", "Cleaning up the look"],
  together: ["Bringing it all together", "Tying it together", "Wiring up the last pieces", "Putting the finishing touches on"],
} as const;

const pagePhrasings = (name: string) => [
  `Building the ${name} page`,
  `Putting together the ${name} page`,
  `Laying out the ${name} page`,
  `Crafting the ${name} page`,
  `Setting up the ${name} page`,
];
const componentPhrasings = (name: string) => [
  `Crafting the ${name} component`,
  `Building the ${name} piece`,
  `Putting together ${name}`,
  `Adding the ${name} component`,
];

// Generic "still working" lines for when the file-derived feed is spent but the
// agent is still customizing — also a pool so the tail never repeats verbatim.
const HOLDING = [
  "Refining the details",
  "Tightening up the styling",
  "Filling in the content",
  "Wiring the pieces together",
  "Adding the finishing touches",
  "Making it feel polished",
  "Getting everything just right",
  "Smoothing out the rough edges",
];

// Truthful tail — only shown when the matching REAL event fires (verify/fix/done).
const TESTING = ["Running a quick test to make sure it works", "Checking everything runs", "Running the build to verify it", "Making sure it all holds together"];
const FIXING = ["Smoothing out a small issue", "Fixing a little thing I spotted", "Cleaning up a minor issue", "Sorting out a detail that needed it"];
const DONE = ["All done — take a look", "Finished — it's ready", "That's it, it's live", "Done — see what you think"];

/* ----------------------- file → concept extraction ------------------ */

const pretty = (s: string) =>
  s
    .replace(/\.[a-z]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

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

function componentName(path: string): string | null {
  const m = path.match(/(?:^|\/)components?\/(?:.*\/)?([A-Za-z0-9_-]+)\.(?:t|j)sx?$/);
  if (!m || /^(index|page|layout)$/i.test(m[1])) return null;
  return pretty(m[1]);
}

/* ------------------------------- estimate --------------------------- */

/**
 * A rough wall-clock estimate (ms) for how long the agent will take to build
 * this project — used to PACE the feed so a fast build shows fewer, calmer lines
 * and a big build shows more. It's only a pacing hint: real turn events always
 * override it (the feed collapses to "done" the instant the reply lands, and
 * stretches with holding lines if it runs long).
 */
export function estimateBuildSeconds(opts: { files: string[]; kind?: "app" | "game"; featureCount?: number }): number {
  const n = opts.files?.length ?? 0;
  const base = opts.kind === "game" ? 55 : n > 12 ? 70 : n > 6 ? 45 : 28; // bigger skeleton → longer
  const features = Math.min(6, opts.featureCount ?? 0) * 8;
  return base + features;
}

/* ------------------------------ narration --------------------------- */

export interface Narration {
  /** File-derived "building …" lines, in build order, with varied phrasing. */
  steps: string[];
  /** Generic "still working" lines (varied) to cover any overrun. */
  holding: string[];
  /** Pacing hint in ms. */
  estimateMs: number;
}

/**
 * Build the varied, seeded narration for a freshly-scaffolded project. Same
 * files + same seed → same narration (stable); different seed → different
 * wording and order (so it never reads as canned across projects).
 */
export function buildNarration(
  files: string[],
  opts: { idea?: string; kind?: "app" | "game"; seed?: string; featureCount?: number } = {},
): Narration {
  const rng = seededRng(opts.seed || opts.idea || "helix");
  const paths = (files ?? []).filter(Boolean);
  const lower = paths.map((p) => p.toLowerCase());
  const some = (re: RegExp) => lower.some((p) => re.test(p));
  const steps: string[] = [];
  const add = (s: string) => {
    if (s && !steps.includes(s)) steps.push(s);
  };
  const pick = (arr: readonly string[]) => pickWith(rng, arr as string[]);

  const estimateMs = estimateBuildSeconds({ files: paths, kind: opts.kind, featureCount: opts.featureCount }) * 1000;
  const holding = [...HOLDING].sort(() => rng() - 0.5).slice(0, 6);

  if (opts.kind === "game") {
    for (const line of [
      pick(["Setting up the game world", "Building the play area", "Laying out the level"]),
      pick(["Adding the player", "Dropping in the player", "Setting up the hero"]),
      pick(["Spawning the enemies and pickups", "Adding obstacles and pickups", "Placing the enemies"]),
      pick(["Wiring up the controls", "Hooking up the inputs", "Making it respond to keys"]),
      pick(["Adding the score and on-screen UI", "Setting up the scoreboard", "Adding the HUD"]),
      pick(["Tuning the gameplay", "Balancing the difficulty", "Making it fun to play"]),
      pick(POOLS.together),
    ])
      add(line);
    return { steps, holding, estimateMs };
  }

  add(pick(POOLS.foundation));
  if (some(/package\.json|requirements\.txt|go\.mod|gemfile|composer\.json/)) add(pick(POOLS.deps));
  if (some(/tailwind|postcss|globals?\.css|theme|tokens\.css|(^|\/)styles?\//)) add(pick(POOLS.design));
  if (some(/(^|\/)(app\/layout|_app|_document|base\.html|layout\.(t|j)sx?)/)) add(pick(POOLS.skeleton));

  const pages: string[] = [];
  for (const p of paths) {
    const nm = pageName(p);
    if (nm && !pages.includes(nm)) pages.push(nm);
  }
  pages.sort((a, b) => (a === "Home" ? -1 : b === "Home" ? 1 : 0));
  for (const nm of pages.slice(0, 5)) add(pick(pagePhrasings(nm.toLowerCase())));

  if (some(/auth|login|sign[\s-]?in|sign[\s-]?up|session/)) add(pick(POOLS.auth));
  if (some(/(^|\/)(nav|sidebar|header|navbar|topbar)/)) add(pick(POOLS.nav));

  const comps: string[] = [];
  for (const p of paths) {
    const nm = componentName(p);
    if (nm && !comps.includes(nm)) comps.push(nm);
  }
  for (const nm of comps.slice(0, 3)) add(pick(componentPhrasings(nm)));

  if (some(/(^|\/)(api|routes?|server|controllers?)\//) || some(/(^|\/)route\.(t|j)s$/)) add(pick(POOLS.api));
  if (some(/(^|\/)(models?|prisma|schema)/)) add(pick(POOLS.data));

  add(pick(POOLS.refine));
  add(pick(POOLS.together));
  return { steps, holding, estimateMs };
}

/**
 * Rephrase a RAW agent activity label (e.g. the verify phase) into a friendly,
 * varied line — so the "testing/fixing" tail reads in the same warm voice as the
 * feed instead of "verifying — npm run build…". Returns null for noisy
 * file-write labels (the feed owns those). Seeded so it varies across projects.
 */
export function friendlyActivity(label: string, seed = ""): string | null {
  const l = label.toLowerCase();
  const rng = seededRng(seed + "|" + label);
  const pick = (arr: readonly string[]) => pickWith(rng, arr as string[]);
  if (/verif|checking your scripts|headless browser|run the build|running it/.test(l)) return pick(TESTING);
  if (/fix|repair|debug|resolve/.test(l)) return pick(FIXING);
  if (/^(wrote|created|deleted|read|edited|editing|writing|reading|scanning|listing|searching|scaffolding|setting up your)/.test(l))
    return null; // noisy — the feed narrates these
  return label; // anything else passes through unchanged
}

export const DONE_LINES = DONE;

/* ------------------- synthesized replies (hybrid) ------------------- */
// After a build/fix turn we write the user-facing summary OURSELVES — varied,
// truthful, and derived from the REAL result (files changed + verify status) —
// instead of relying on the model's prose. The model's own reply is kept in a
// collapsible "details", so nothing is lost. 0 tokens, and it lets us tell the
// agent to stay terse. Truth rule: every claim here comes from a real signal.

const baseName = (p: string) => p.split("/").pop() || p;

function summarizeFiles(written: string[], deleted: string[]): string {
  const names = Array.from(new Set([...written, ...deleted].map(baseName)));
  if (names.length === 0) return "a few things";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/**
 * Our own friendly, varied summary of a finished turn — or null when nothing
 * changed (a question/answer turn), in which case the model's own text should
 * stand. Seeded so two projects never read identically.
 */
export function synthesizeReply(opts: {
  changes?: { written: string[]; deleted: string[] };
  verify?: { status: "passed" | "failed" | "skipped"; command?: string } | null;
  userMessage?: string;
  kind?: "app" | "game";
  isFirstBuild?: boolean;
  seed?: string;
}): string | null {
  const written = opts.changes?.written ?? [];
  const deleted = opts.changes?.deleted ?? [];
  if (written.length + deleted.length === 0) return null; // no file changes → keep the model's reply

  const rng = seededRng(`${opts.seed ?? ""}|${opts.userMessage ?? ""}|${written.length}|${deleted.length}`);
  const pick = (arr: readonly string[]) => pickWith(rng, arr as string[]);

  let verifyClause = "";
  if (opts.verify?.status === "passed")
    verifyClause = " " + pick(["The build checks out. ✓", "Tested it and it runs. ✓", "Verified it builds. ✓", "Ran it — all good. ✓"]);
  else if (opts.verify?.status === "failed")
    verifyClause = " " + pick(["One check didn't pass yet — want me to dig in?", "A check flagged something; say the word and I'll fix it.", "The build needs another pass — should I take a look?"]);

  if (opts.isFirstBuild) {
    const what =
      opts.kind === "game"
        ? pick(["Your game is ready", "Your game's set up", "Here's your game"])
        : pick(["Your app is ready", "It's built and ready", "Here's your app", "Your project is set up"]);
    const filePart = pick([`I put together ${written.length} files`, `${written.length} files in place`, `built out ${written.length} files`]);
    const look = pick(["Take a look in the preview.", "Have a look in the preview.", "Check the preview to see it live.", "See it live in the preview."]);
    return `${what} — ${filePart}.${verifyClause} ${look}`.replace(/\s+/g, " ").trim();
  }

  const lead = pick(["Done", "All set", "Sorted", "Updated"]);
  const verb = pick(["updated", "changed", "reworked", "touched up"]);
  return `${lead} — ${verb} ${summarizeFiles(written, deleted)}.${verifyClause}`.replace(/\s+/g, " ").trim();
}

/**
 * A friendly, varied "on it" line for a follow-up request — paraphrased from the
 * user's message by category (never echoed verbatim). Seeded so it varies.
 */
export function paraphraseRequest(message: string, seed = ""): string {
  const m = message.toLowerCase();
  const rng = seededRng(seed + "|" + message);
  const pick = (arr: readonly string[]) => pickWith(rng, arr as string[]);
  if (/colou?r|styl|theme|css|font|look|design|palette|background/.test(m)) return pick(["Updating the styling", "Reworking the look", "Adjusting the design", "Tweaking the styles"]);
  if (/\bfix|bug|broke|broken|error|issue|not work|doesn'?t work|isn'?t work/.test(m)) return pick(["Fixing that", "Sorting that out", "Tracking that down", "Getting that fixed"]);
  if (/\badd|create|new |another|include|build me|put a/.test(m)) return pick(["Adding that in", "Building that out", "Putting that together", "Wiring that up"]);
  if (/\bremove|delete|get rid|take out|hide/.test(m)) return pick(["Removing that", "Taking that out", "Clearing that out"]);
  if (/text|copy|word|content|label|title|heading|message/.test(m)) return pick(["Updating the content", "Reworking the copy", "Adjusting the text"]);
  if (/layout|move|position|align|spacing|bigger|smaller|resize|center/.test(m)) return pick(["Adjusting the layout", "Repositioning things", "Tidying the layout"]);
  if (/nav|menu|sidebar|header|footer|\blink/.test(m)) return pick(["Updating the navigation", "Reworking the nav", "Adjusting the menu"]);
  return pick(["Making that change", "Working on that", "Getting that done", "On it"]);
}

/** Varied generic "still working" lines for a given seed (for the fix feed). */
export function holdingLines(seed: string): string[] {
  const rng = seededRng(seed + "|hold");
  return [...HOLDING].sort(() => rng() - 0.5).slice(0, 4);
}
