/**
 * Build-task derivation for the live build board — token-free. The cards are
 * inferred deterministically from the MVC structure the template engine already
 * scaffolded (framework + real file paths), so the lanes reflect the actual
 * shape of the app. The board then ADVANCES these cards from the real build
 * telemetry (activity events + file writes), so it's dynamic without spending
 * AI tokens. Falls back to a generic plan when there's no structure yet.
 */

import { detectFramework } from "./scaffold-steps";

const has = (paths: string[], re: RegExp) => paths.some((p) => re.test(p));

/** A generic, framework-agnostic plan from the prompt alone. */
function genericTasks(): string[] {
  return ["Plan the layout", "Build the interface", "Add interactivity", "Style & polish", "Final review"];
}

/**
 * Build subtasks from the scaffold. Each card is gated on real files/dirs so it
 * describes work the app actually needs — not a fabricated step.
 */
export function buildTasks(paths: string[]): string[] {
  const framework = detectFramework(paths);
  const tasks: string[] = [];

  if (framework) tasks.push(`Set up the ${framework} app`);
  if (has(paths, /(^|\/)(models?|schema)\b/i) || has(paths, /models\//i)) tasks.push("Define the data models");
  if (has(paths, /(controllers?|routes?|api)\//i) || has(paths, /(^|\/)(routes|api)\.[jt]s/i))
    tasks.push("Build controllers & routes");
  if (has(paths, /(views?|templates?|pages?)\//i) || has(paths, /app\/(page|layout)\.[jt]sx?$/i))
    tasks.push("Create the views");
  if (has(paths, /components?\//i)) tasks.push("Build UI components");
  if (has(paths, /(config|middleware)/i) || has(paths, /\.env/i) || has(paths, /(wsgi|gunicorn)/i))
    tasks.push("Configure env & security");
  if (has(paths, /tailwind|postcss|styles?\//i) || has(paths, /\.css$/i)) tasks.push("Style the interface");
  tasks.push("Wire it together & review");

  // De-dupe while keeping order.
  const seen = new Set<string>();
  const out = tasks.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));

  // Too little structure to be interesting → generic plan.
  return out.length >= 3 ? out.slice(0, 7) : genericTasks();
}
