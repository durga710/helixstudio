/**
 * Build-log distillation — turn a noisy `npm run build` / `tsc` / test transcript
 * into the few lines a model actually needs to fix it.
 *
 * Why: the engine has NO prompt caching on its default provider, so every fix
 * round-trip re-sends the whole conversation at full price. Feeding back an 8k
 * tail of webpack spinner output, "Creating an optimized production build…",
 * tsconfig-reconfigured notices, and stack frames pays for tokens that carry no
 * signal. We keep the actual error (compile failures, `path:line:col` frames,
 * `Error:`/`Type error:` lines) and drop the chrome — typically a 5-15x cut.
 *
 * Pure + deterministic; safe to unit-test. Falls back to the raw tail when it
 * can't find anything structured, so it never hides a real failure.
 */

/** Lines that are pure build chrome — never carry fix signal. */
const NOISE_RE = [
  /^\s*$/,
  /Creating an optimized production build/i,
  /Compiled successfully/i,
  /Linting and checking validity of types/i,
  /Collecting page data/i,
  /Generating static pages/i,
  /Finalizing page optimization/i,
  /We detected TypeScript in your project/i,
  /The following suggested values were added/i,
  /was updated to add/i,
  /^\s*[-▲✓✔○●◐] /,
  /^\s*(info|warn|ready|event|wait)\s+-/i,
  /node_modules\/\.bin/i,
  /npm (warn|notice)/i,
  /^>\s+\S+@\S+\s+\w+/, // npm lifecycle banner: "> app@0.1.0 build"
  /^>\s+(next build|tsc|vite build|playwright)/i,
];

/** Lines that signal the START of an actionable error region. */
const ERROR_START_RE = [
  /Failed to compile/i,
  /\bType error:/i,
  /\bSyntax error:/i,
  /\berror\b\s*TS\d+/i, // tsc: "error TS2307:"
  /^\s*Error:/i,
  /Module not found/i,
  /Cannot find (module|name)/i,
  /^\S.*\.(t|j)sx?:\d+(:\d+)?/i, // a file:line[:col] frame at line start
  /^\s*\.\/.+:\d+/i, // next-style "./app/x.tsx:10:21"
  /ELIFECYCLE|exited with|exit code [1-9]/i,
];

const MAX_LINES = 40;
const MAX_CHARS = 2_400;

function isNoise(line: string): boolean {
  return NOISE_RE.some((re) => re.test(line));
}

function isErrorStart(line: string): boolean {
  return ERROR_START_RE.some((re) => re.test(line));
}

/**
 * Extract the actionable error region from a build/test log. Returns a compact
 * string (≤ MAX_CHARS) containing the first error block and the lines around it,
 * or the de-noised tail when no structured error marker is found.
 */
export function extractBuildError(log: string): string {
  const lines = log.split(/\r?\n/);

  // Find the first error-start marker.
  let start = lines.findIndex(isErrorStart);
  if (start === -1) {
    // No structured error — return the de-noised tail so we still send signal.
    const kept = lines.filter((l) => !isNoise(l));
    const tail = kept.slice(Math.max(0, kept.length - MAX_LINES)).join("\n");
    return tail.length > MAX_CHARS ? tail.slice(tail.length - MAX_CHARS).trim() : tail.trim();
  }

  // Keep a couple of lines of lead-in for context (e.g. the "Failed to compile"
  // header above a file frame), then take forward through the error region.
  start = Math.max(0, start - 1);
  const region: string[] = [];
  for (let i = start; i < lines.length && region.length < MAX_LINES; i++) {
    const line = lines[i];
    if (isNoise(line) && region.length > 0) continue; // skip interior chrome
    region.push(line);
  }

  let out = region.join("\n").trim();
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS) + "\n… (truncated)";
  return out;
}
