/**
 * Creation-sequence steps for the build studio. While the first agent turn is
 * still warming up on a freshly-scaffolded project, we fill the dead time with
 * a short, paced checklist — but every line is TRUE: it's derived from the real
 * files the template engine just injected, so it reads as genuine work, not a
 * fake loader. The labels are discovered from the actual file paths.
 */

export interface ScaffoldPlan {
  framework: string | null;
  steps: string[];
}

const has = (paths: string[], re: RegExp) => paths.some((p) => re.test(p));

/** Best-effort stack label from the scaffold's file paths. */
export function detectFramework(paths: string[]): string | null {
  if (has(paths, /(^|\/)next\.config\./) || has(paths, /(^|\/)app\/(layout|page)\.(t|j)sx?$/)) return "Next.js";
  if (has(paths, /(^|\/)vite\.config\./)) return "Vite + React";
  if (has(paths, /(^|\/)manage\.py$/)) return "Django";
  if (has(paths, /(^|\/)wsgi\.py$/) || has(paths, /(^|\/)app\/__init__\.py$/)) return "Flask";
  if (has(paths, /(^|\/)src\/(server|app)\.js$/) || has(paths, /(^|\/)server\.js$/)) return "Express";
  if (has(paths, /(^|\/)src\/App\.(t|j)sx$/)) return "React";
  return null;
}

/** Top-level directories present in the scaffold (for a real "created …" line). */
function topDirs(paths: string[]): string[] {
  const dirs = new Set<string>();
  for (const p of paths) {
    const i = p.indexOf("/");
    if (i > 0) dirs.add(p.slice(0, i));
  }
  return Array.from(dirs);
}

/**
 * A paced, truthful checklist for the scaffold. Only includes a line when the
 * corresponding files actually exist, so nothing is fabricated.
 */
export function scaffoldSteps(paths: string[]): ScaffoldPlan {
  const framework = detectFramework(paths);
  const steps: string[] = [];

  steps.push(framework ? `Detected stack — ${framework}` : "Reading the workspace");
  steps.push("Scaffolding project structure");

  const dirs = topDirs(paths).filter((d) => !d.startsWith(".")).slice(0, 4);
  if (dirs.length) steps.push(`Created ${dirs.join(", ")}`);
  if (paths.length) steps.push(`Loaded ${paths.length} starter file${paths.length === 1 ? "" : "s"}`);

  // Config lines — each gated on a real file so the claim is always honest.
  if (has(paths, /tailwind\.config|postcss\.config/)) steps.push("Configuring Tailwind CSS");
  if (has(paths, /(^|\/)tsconfig\.json$/)) steps.push("Enabling TypeScript");
  if (has(paths, /eslint/i)) steps.push("Setting up ESLint");
  // Backend starters ship env-driven secrets + security middleware (helmet/CORS,
  // SECRET_KEY, SSL/HSTS) — surface that only when those files are present.
  if (has(paths, /(^|\/)(config\.py|gunicorn|\.env\.example)$/) || has(paths, /middleware/i))
    steps.push("Wiring environment & security config");

  steps.push("Handing off to the Helix agent");
  return { framework, steps };
}
