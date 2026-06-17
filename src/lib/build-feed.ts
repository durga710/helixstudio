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

const BUILD_VERBS = ["Building", "Setting up", "Wiring up", "Putting together", "Adding", "Crafting", "Shaping", "Assembling"];
const POLISH_VERBS = ["Polishing", "Refining", "Tidying up", "Finishing off", "Tightening up"];

/** A concrete, human label for a single file — its page/component name when we
 * can detect one, else a prettified file name. */
function fileConcept(path: string): string {
  const pg = pageName(path);
  if (pg) return `the ${pg.toLowerCase()} page`;
  const cp = componentName(path);
  if (cp) return `the ${cp} component`;
  return pretty(path.split("/").pop() || path);
}

/**
 * An endless-feeling, varied stream of concrete "Building <file>" lines drawn
 * from the REAL project files — so a long build never dries up into a repeating
 * "thinking…" loader. The user always sees a real filename being worked on,
 * which masks the model's background latency. Shuffled + seeded so no two
 * projects read identically; the client cycles through it (looping) until the
 * turn actually finishes.
 */
export function continuousBuildLines(files: string[], seed: string): string[] {
  const rng = seededRng(seed + "|stream");
  const concepts = Array.from(
    new Set(
      files
        .filter((f) => !/\.(png|jpe?g|svg|ico|gif|webp|avif|woff2?|ttf|otf|map|lock)$/i.test(f))
        .map(fileConcept),
    ),
  );
  if (concepts.length === 0) return [...HOLDING];
  const lines: string[] = [];
  for (const c of concepts) lines.push(`${pickWith(rng, [...BUILD_VERBS])} ${c}`);
  for (const c of concepts) lines.push(`${pickWith(rng, [...POLISH_VERBS])} ${c}`);
  // Fisher–Yates with the seeded rng so the order is varied but stable per project.
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return lines.length ? lines : [...HOLDING];
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

  // The verify clause says ONLY what we actually know: the project BUILDS/runs
  // without errors. It must never imply "this is what you asked for" — that's for
  // the user to judge — so it invites a look instead of declaring success.
  let verifyClause = "";
  if (opts.verify?.status === "passed")
    verifyClause = " " + pick([
      "It builds and runs — take a look and tell me if it's what you pictured.",
      "Compiles and runs cleanly. ✓ Check the preview and say what to tweak.",
      "Runs with no errors. ✓ See if it matches what you had in mind.",
      "The build's green. ✓ Have a look and tell me what's off.",
    ]);
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

  // Pushback ("this isn't right / still wrong / not what I meant / not temple
  // run") — DON'T claim success again. Acknowledge another pass and ask for the
  // specifics, instead of "All set ✓" on something the user just rejected.
  const msg = (opts.userMessage ?? "").toLowerCase();
  const isRejection =
    /\b(not|isn'?t|aren'?t|still|nope|nah|wrong|terrible|awful|ugly|hate|doesn'?t|didn'?t|won'?t|broken|again|no good)\b/.test(msg) &&
    !/\b(add|create|make|build|change|update|remove|delete|put|set|turn|move|rename|give|use|show)\b/.test(msg);
  if (isRejection) {
    const again = pick(["Took another pass at", "Had another go at", "Reworked"]);
    const ask = pick([
      "is it closer? Tell me exactly what's still off.",
      "closer now? Tell me what to change and I'll nail it.",
      "how's this? Point me at what's still wrong and I'll fix it.",
    ]);
    return `${again} ${summarizeFiles(written, deleted)} — ${ask}`.replace(/\s+/g, " ").trim();
  }

  // Otherwise lead with WHAT they asked for (paraphrased), so two follow-ups
  // never read identically and the reply reflects intent, not just a filename.
  const intent = summaryIntent(msg, rng);
  return `${intent} — ${summarizeFiles(written, deleted)}.${verifyClause}`.replace(/\s+/g, " ").trim();
}

/** Past-tense paraphrase of a follow-up request by category, for the summary
 * lead (the present-tense twin is `paraphraseRequest`, used for the live feed). */
function summaryIntent(message: string, rng: () => number): string {
  const pick = (arr: readonly string[]) => pickWith(rng, arr as string[]);
  const m = message;
  if (/colou?r|styl|theme|css|font|look|design|palette|background/.test(m)) return pick(["Reworked the look", "Updated the styling", "Adjusted the design"]);
  if (/\bfix|bug|broke|broken|error|issue|crash|not work|doesn'?t work|isn'?t work/.test(m)) return pick(["Fixed that", "Sorted that out", "Patched it up"]);
  if (/\badd|create|new |another|include|put a/.test(m)) return pick(["Added that in", "Built that out", "Put that together"]);
  if (/\bremove|delete|get rid|take out|hide/.test(m)) return pick(["Removed that", "Took that out", "Cleared that out"]);
  if (/text|copy|word|content|label|title|heading|message/.test(m)) return pick(["Updated the content", "Reworked the copy", "Adjusted the text"]);
  if (/layout|move|position|align|spacing|bigger|smaller|resize|center/.test(m)) return pick(["Adjusted the layout", "Repositioned things", "Tidied the layout"]);
  if (/nav|menu|sidebar|header|footer|\blink/.test(m)) return pick(["Updated the navigation", "Reworked the nav", "Adjusted the menu"]);
  return pick(["Made that change", "Updated it", "Got that done"]);
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
