/**
 * Deterministic build fixers — repair the most common, statically-decidable
 * code errors WITHOUT calling the model. These run over the workspace file map
 * (an in-memory snapshot of the overlay) as pure functions, so they cost zero
 * tokens, never loop, and produce the same output for the same input.
 *
 * Why this exists: a weak engine model can burn hundreds of thousands of tokens
 * (and never converge) on errors a compiler resolves for free — most infamously
 * an import whose CASE doesn't match the file on disk, and a named import of a
 * symbol the target module defines but forgot to export. Both are facts we can
 * read straight off the file tree. We fix them before the build ever runs, so
 * the model only ever sees genuinely-semantic failures.
 *
 * Scope (deliberately conservative — a wrong "fix" is worse than none):
 *   1. import-casing   — specifier resolves case-insensitively to exactly one
 *                        file but the case differs → rewrite the specifier.
 *   2. missing-export  — a named import targets a symbol the module DEFINES at
 *                        top level but does not export → add the `export` keyword.
 * Anything ambiguous (multiple case-insensitive matches, symbol not defined at
 * all, extension changes) is left untouched for the model to handle.
 */

export type FileMap = Readonly<Record<string, string>>;

export type FixKind = "import-casing" | "missing-export" | "use-client";

export interface DeterministicFix {
  /** Workspace-relative path of the file that was rewritten. */
  path: string;
  kind: FixKind;
  /** One-line, human-readable description for the activity log. */
  detail: string;
}

export interface FixOutcome {
  /** New content for each changed file, keyed by path. Empty when nothing changed. */
  changed: Record<string, string>;
  fixes: DeterministicFix[];
}

/** Path-alias map, e.g. `{ "@/": ["src/"] }`. Trailing slashes are normalized. */
export type AliasMap = Readonly<Record<string, readonly string[]>>;

const SOURCE_RE = /\.(?:tsx?|jsx?|mjs|cjs)$/i;
const RESOLVE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"] as const;
/** Files larger than this are skipped — a pathological input shouldn't stall a build. */
const MAX_SCAN_CHARS = 400_000;

/** Default Next.js / Vite alias when a workspace tsconfig isn't available. */
export const DEFAULT_ALIASES: AliasMap = { "@/": ["src/", ""] };

function isSourceFile(path: string): boolean {
  return SOURCE_RE.test(path) && !path.includes("node_modules/");
}

/** Normalize a POSIX-ish path: collapse `.`/`..` segments, strip leading `./`. */
function normalizePath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const seg of parts) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Expand an import specifier to the candidate base path(s) it could resolve to,
 * relative to the importer. Returns null for bare/package imports (which we
 * never touch). Each candidate is a normalized, extension-less base path.
 */
function specifierTargets(spec: string, importerPath: string, aliases: AliasMap): string[] | null {
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return [normalizePath(`${dirOf(importerPath)}/${spec}`)];
  }
  for (const [prefix, roots] of Object.entries(aliases)) {
    const pfx = prefix.endsWith("/") ? prefix : `${prefix}/`;
    if (spec === prefix.replace(/\/$/, "") || spec.startsWith(pfx)) {
      const rest = spec.slice(pfx.length);
      return roots.map((r) => normalizePath(`${r}/${rest}`));
    }
  }
  return null; // bare/package import — out of scope
}

interface Resolution {
  /** The real file path as it exists in the map. */
  realPath: string;
  /** True when the only reason an exact match failed was letter case. */
  casingMismatch: boolean;
}

interface FileIndex {
  exact: Set<string>;
  /** lowercased path → real paths (>1 means a true case collision we won't touch). */
  lower: Map<string, string[]>;
}

/**
 * Resolve an extension-less base path to a real file in the map, trying the
 * standard extension and `/index` forms. Reports whether the match required a
 * case-insensitive comparison (i.e. the specifier's case is wrong).
 */
function resolveTarget(base: string, index: FileIndex): Resolution | null {
  const candidates: string[] = [base];
  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(`${base}.${ext}`);
    candidates.push(`${base}/index.${ext}`);
  }
  // Exact-case match wins outright.
  for (const c of candidates) {
    if (index.exact.has(c)) return { realPath: c, casingMismatch: false };
  }
  // Fall back to a UNIQUE case-insensitive match — that's a casing bug.
  for (const c of candidates) {
    const hits = index.lower.get(c.toLowerCase());
    if (hits && hits.length === 1) return { realPath: hits[0], casingMismatch: true };
  }
  return null;
}

function indexFiles(files: FileMap): FileIndex {
  const exact = new Set<string>();
  const lower = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    exact.add(path);
    const key = path.toLowerCase();
    const arr = lower.get(key);
    if (arr) arr.push(path);
    else lower.set(key, [path]);
  }
  return { exact, lower };
}

/** Matches the specifier in import/export-from/require/dynamic-import statements,
 *  capturing the quote and the specifier text so we can rewrite it in place. */
const SPECIFIER_RE =
  /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g;

/** Rewrite a resolved real path back into specifier form, preserving the alias
 *  or relative prefix and dropping the extension when the original omitted it. */
function correctedSpecifier(original: string, realPath: string, base: string): string {
  // `base` is the normalized extension-less target the original pointed at.
  // `realPath` is the real file (possibly with extension / index). Drop the
  // extension and trailing /index unless the original specifier kept them.
  const hadExt = SOURCE_RE.test(original);
  let corrected = realPath;
  if (!hadExt) {
    corrected = corrected.replace(SOURCE_RE, "");
    if (!/\/index$/i.test(base)) corrected = corrected.replace(/\/index$/i, "");
  }
  // The original and corrected differ only in the case of trailing segments.
  // Splice the case-corrected tail onto the original so `@/` or `./` survives:
  // walk both from the END, replacing each original segment with the corrected
  // one only when they match case-insensitively.
  const corrSegs = corrected.split("/");
  const origSegs = original.split("/");
  const merged = origSegs.map((seg, i) => {
    const fromEnd = origSegs.length - i;
    const c = corrSegs[corrSegs.length - fromEnd];
    return c && c.toLowerCase() === seg.toLowerCase() ? c : seg;
  });
  return merged.join("/");
}

/** Pass 1 — fix import specifiers whose case doesn't match the real file. */
function fixImportCasing(files: FileMap, index: FileIndex, aliases: AliasMap): FixOutcome {
  const changed: Record<string, string> = {};
  const fixes: DeterministicFix[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (!isSourceFile(path) || content.length > MAX_SCAN_CHARS) continue;
    let fileChanged = false;

    const next = content.replace(SPECIFIER_RE, (match, quote: string, spec: string) => {
      const targets = specifierTargets(spec, path, aliases);
      if (!targets) return match;
      for (const base of targets) {
        const res = resolveTarget(base, index);
        if (!res) continue;
        if (!res.casingMismatch) return match; // already correct
        const fixed = correctedSpecifier(spec, res.realPath, base);
        if (fixed === spec) return match;
        fileChanged = true;
        fixes.push({
          path,
          kind: "import-casing",
          detail: `${spec} → ${fixed} (matches ${res.realPath})`,
        });
        return match.replace(`${quote}${spec}${quote}`, `${quote}${fixed}${quote}`);
      }
      return match;
    });

    if (fileChanged) changed[path] = next;
  }
  return { changed, fixes };
}

const NAMED_IMPORT_RE = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/g;

/** Parse the importable names from a `{ A, B as C, type D }` clause. */
function parseNamedImports(clause: string): string[] {
  return clause
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
    .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
}

/**
 * Does the module export `name` as a NAMED export (the only kind a named import
 * `{ name }` can resolve)? Deliberately excludes `export default` — a default
 * export does NOT satisfy a named import, and conflating them is the bug that
 * lets the real "import { DataTable } from a default-only module" failure slip
 * through. Covers declarations, `export { name }`, and `export { x as name }`.
 */
function hasNamedExport(content: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `export function name` / `export const name` … — but NOT `export default …`.
  if (new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|class|const|let|var|type|interface|enum)\\s+${esc}\\b`).test(content)) return true;
  // export { name } / export { x as name } / export { name } from "…"
  const blocks = content.match(/\bexport\s*\{([^}]*)\}/g) ?? [];
  for (const b of blocks) {
    const inner = b.replace(/\bexport\s*\{/, "").replace(/\}$/, "");
    for (const part of inner.split(",")) {
      const exportedAs = part.includes(" as ") ? part.split(/\s+as\s+/)[1] : part;
      if (exportedAs.trim() === name) return true;
    }
  }
  return false;
}

/**
 * Does the module export `name` as its DEFAULT export — either inline
 * (`export default function name`/`export default class name`) or by reference
 * (`export default name;`)? When a named import wants `name` and the module only
 * default-exports it, the safe deterministic repair is to add a named export.
 */
function hasDefaultExportOf(content: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\bexport\\s+default\\s+(?:async\\s+)?(?:function|class)\\s+${esc}\\b`).test(content)) return true;
  if (new RegExp(`\\bexport\\s+default\\s+${esc}\\s*;`).test(content)) return true;
  return false;
}

/** Find a top-level declaration of `name` that is NOT exported, and return a
 *  content rewrite that prepends `export ` to it. Null when not safely fixable. */
function addExportToDeclaration(content: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match a top-level (column 0) declaration not already preceded by `export`.
  const decl = new RegExp(`^((?:async\\s+)?(?:function|class|const|let|var|type|interface|enum)\\s+${esc}\\b)`, "m");
  const m = decl.exec(content);
  if (!m) return null;
  // Guard: ensure it isn't already exported on the same line (e.g. `export function`).
  const lineStart = content.lastIndexOf("\n", m.index) + 1;
  const nextNl = content.indexOf("\n", m.index);
  const line = content.slice(lineStart, nextNl === -1 ? undefined : nextNl);
  if (/^\s*export\b/.test(line)) return null;
  return content.slice(0, m.index) + "export " + content.slice(m.index);
}

/** Pass 2 — add `export` to a symbol a named import wants but the module defines unexported. */
function fixMissingExports(
  files: FileMap,
  index: FileIndex,
  aliases: AliasMap,
  working: Record<string, string>,
): FixOutcome {
  const changed: Record<string, string> = {};
  const fixes: DeterministicFix[] = [];
  const read = (p: string): string => working[p] ?? files[p];

  for (const [path] of Object.entries(files)) {
    if (!isSourceFile(path) || files[path].length > MAX_SCAN_CHARS) continue;
    const content = read(path);
    let m: RegExpExecArray | null;
    NAMED_IMPORT_RE.lastIndex = 0;
    while ((m = NAMED_IMPORT_RE.exec(content))) {
      const names = parseNamedImports(m[1]);
      const spec = m[3];
      const targets = specifierTargets(spec, path, aliases);
      if (!targets) continue;
      let realPath: string | null = null;
      for (const base of targets) {
        const res = resolveTarget(base, index);
        if (res) { realPath = res.realPath; break; }
      }
      if (!realPath || !isSourceFile(realPath)) continue;
      for (const name of names) {
        const targetContent = changed[realPath] ?? read(realPath);
        if (hasNamedExport(targetContent, name)) continue; // already importable by name
        // Case 1: the symbol is defined here but not exported — add `export`.
        const exported = addExportToDeclaration(targetContent, name);
        if (exported) {
          changed[realPath] = exported;
          fixes.push({ path: realPath, kind: "missing-export", detail: `exported \`${name}\` (imported by ${path})` });
          continue;
        }
        // Case 2: the module default-exports it, but the import wants it by name
        // — add a named export alongside the default (the real DataTable bug).
        if (hasDefaultExportOf(targetContent, name)) {
          const sep = targetContent.endsWith("\n") ? "" : "\n";
          changed[realPath] = `${targetContent}${sep}export { ${name} };\n`;
          fixes.push({ path: realPath, kind: "missing-export", detail: `added named export \`${name}\` alongside its default export (imported by ${path})` });
          continue;
        }
        // else: symbol not defined here → genuine missing import, leave to the model.
      }
    }
  }
  return { changed, fixes };
}

/** React/Next client-only hooks — calling any of these forces a Client Component.
 *  A Server Component (the App Router default) that uses one fails to build with
 *  "This React hook only works in a client component." */
const CLIENT_HOOK_RE =
  /\b(useState|useEffect|useLayoutEffect|useReducer|useRef|useContext|useImperativeHandle|useSyncExternalStore|useTransition|useDeferredValue|useCallback|useMemo|useRouter|usePathname|useSearchParams|useParams)\s*\(/;

/** Already carries a directive prologue (`"use client"` / `"use server"`) near the top? */
function hasUseDirective(content: string): boolean {
  // Directive prologues sit before any statement; check the first few non-empty,
  // non-comment lines.
  const head = content.split("\n").slice(0, 6).join("\n");
  return /(^|\n)\s*["']use (client|server)["']\s*;?/.test(head);
}

/**
 * Pass 3 — prepend `"use client"` to a component that calls a client-only hook
 * but lacks the directive. Only `.tsx`/`.jsx` (and `.ts`/`.js`) component files,
 * only on a clear hook-call signal, and never when a directive already exists —
 * so it can't wrongly convert a real Server Component.
 */
function fixMissingUseClient(files: FileMap, working: Record<string, string>): FixOutcome {
  const changed: Record<string, string> = {};
  const fixes: DeterministicFix[] = [];
  for (const [path] of Object.entries(files)) {
    if (!isSourceFile(path) || files[path].length > MAX_SCAN_CHARS) continue;
    const content = working[path] ?? files[path];
    if (!CLIENT_HOOK_RE.test(content)) continue;
    if (hasUseDirective(content)) continue;
    changed[path] = `"use client";\n\n${content}`;
    fixes.push({ path, kind: "use-client", detail: `added "use client" (uses a client-only React hook)` });
  }
  return { changed, fixes };
}

/**
 * Run all deterministic fixers over a file map. Returns only the files whose
 * content changed, plus a list of what was fixed. Safe to call on any project;
 * it's a no-op when nothing matches.
 */
export function runDeterministicFixes(files: FileMap, aliases: AliasMap = DEFAULT_ALIASES): FixOutcome {
  const index = indexFiles(files);
  const casing = fixImportCasing(files, index, aliases);
  // Later passes read earlier passes' corrected content where available.
  const changed: Record<string, string> = { ...casing.changed };
  const exportsPass = fixMissingExports(files, index, aliases, changed);
  for (const [p, c] of Object.entries(exportsPass.changed)) changed[p] = c;
  const useClient = fixMissingUseClient(files, changed);
  for (const [p, c] of Object.entries(useClient.changed)) changed[p] = c;
  return { changed, fixes: [...casing.fixes, ...exportsPass.fixes, ...useClient.fixes] };
}

/** Parse `compilerOptions.paths` from a tsconfig string into an AliasMap. */
export function aliasesFromTsconfig(tsconfig: string | null | undefined): AliasMap {
  if (!tsconfig) return DEFAULT_ALIASES;
  try {
    // tsconfig allows comments/trailing commas; strip the common cases.
    const cleaned = tsconfig.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/,(\s*[}\]])/g, "$1");
    const json = JSON.parse(cleaned) as { compilerOptions?: { paths?: Record<string, string[]> } };
    const paths = json.compilerOptions?.paths;
    if (!paths) return DEFAULT_ALIASES;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(paths)) {
      const prefix = k.replace(/\*$/, "");
      out[prefix] = v.map((r) => r.replace(/\*$/, "").replace(/^\.\//, ""));
    }
    return Object.keys(out).length ? out : DEFAULT_ALIASES;
  } catch {
    return DEFAULT_ALIASES;
  }
}
