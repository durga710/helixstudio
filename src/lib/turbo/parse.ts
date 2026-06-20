/**
 * Pure parsers + shared types for the turbo build path. Dependency-free (no
 * `server-only`, no model/db imports) so they're unit-testable with the plain
 * node test runner — the model calls live in manifest.ts / generate.ts around
 * these. Mirrors the jobs/parse.ts split.
 */

export interface TurboFileSpec {
  /** Workspace-relative path to generate. */
  path: string;
  /** One- or two-sentence description of what this file must contain. */
  spec: string;
}

export interface TurboManifest {
  /** A compact shared contract every generator sees: the data model, the core
   *  types/interfaces, routing + naming conventions. Keeps independently
   *  generated files consistent without a conversation between them. */
  contract: string;
  files: TurboFileSpec[];
}

export interface AiPrefs {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  extraHeaders?: Record<string, string>;
}

/** Cap the fan-out — beyond this, fall back to the sequential loop. */
export const TURBO_MAX_FILES = 40;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Extract + validate the manifest JSON from a model reply. */
export function parseManifest(text: string): TurboManifest | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const contract = str(o.contract, 8_000);
  const rawFiles = Array.isArray(o.files) ? o.files : [];
  const seen = new Set<string>();
  const files: TurboFileSpec[] = [];
  for (const f of rawFiles) {
    if (!f || typeof f !== "object") continue;
    const path = str((f as Record<string, unknown>).path, 200).trim().replace(/^\.?\//, "");
    const spec = str((f as Record<string, unknown>).spec, 600).trim();
    if (!path || !spec || seen.has(path) || path.includes("..")) continue;
    seen.add(path);
    files.push({ path, spec });
    if (files.length >= TURBO_MAX_FILES) break;
  }
  if (files.length === 0) return null;
  return { contract, files };
}

/** Build the user prompt for one file worker. */
export function buildWorkerUser(
  manifest: TurboManifest,
  spec: TurboFileSpec,
  request: string,
  notes: string | null,
): string {
  const fileList = manifest.files.map((f) => `- ${f.path}`).join("\n");
  return (
    `APP REQUEST:\n${request}\n\n` +
    (notes ? `PROJECT NOTES (scaffold in place):\n${notes}\n\n` : "") +
    `SHARED CONTRACT (every file agrees on this):\n${manifest.contract}\n\n` +
    `ALL FILES IN THIS BUILD (so you import siblings at the right paths):\n${fileList}\n\n` +
    `YOUR FILE: ${spec.path}\nWHAT IT MUST CONTAIN: ${spec.spec}\n\n` +
    `Output the complete contents of ${spec.path} now, in one fenced code block.`
  );
}

/** Extract the file body from a worker reply: the first fenced code block, or
 *  the whole trimmed text if the model didn't fence it. */
export function parseFileReply(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fence = /```[^\n]*\n([\s\S]*?)\n?```/.exec(trimmed);
  if (fence) {
    const body = fence[1];
    return body.length ? body : null;
  }
  // No fence — accept the raw text only if it looks like code, not an apology.
  if (/^(i\b|sorry|sure|here|certainly|as an ai)/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Run `fn` over `items` with at most `concurrency` in flight, preserving input
 * order in the results. Pure orchestration (the async work is `fn`'s).
 */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  const workers = Array.from({ length: n }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
