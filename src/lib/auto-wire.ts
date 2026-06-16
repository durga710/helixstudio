/**
 * Safety net for the #1 "it built the feature but nothing shows" failure: the
 * model creates a feature component (e.g. components/calendar/calendar-app.tsx)
 * but never mounts it on the page the user actually lands on
 * (app/(app)/dashboard/page.tsx), so the app opens to the leftover placeholder.
 *
 * After a build turn we check: did the model create a feature component that NO
 * page imports? If so it's orphaned — we deterministically mount it on the
 * landing page (replacing the placeholder) so the user always sees their app.
 * Best-effort and conservative: it only acts on a clearly-orphaned component and
 * never touches a feature the model already wired up.
 */

// Template components that ship with the premium skeleton — never the user's
// feature, so they don't count as something to mount.
const TEMPLATE_COMPONENTS = /(^|\/)(sidebar|topbar|theme-picker|fade-in)\.(t|j)sx$/i;

const baseName = (p: string) => p.split("/").pop() || p;
const pascal = (file: string) =>
  baseName(file)
    .replace(/\.(t|j)sx?$/i, "")
    .replace(/[-_]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toUpperCase());

/** Detect how a component file exports its component, so we import it correctly. */
function detectExport(content: string): { kind: "default" | "named"; name: string } | null {
  if (/export\s+default\s+(?:function|class)?\s*\(?/.test(content)) {
    const m = content.match(/export\s+default\s+(?:function|class)\s+([A-Z]\w+)/);
    return { kind: "default", name: m?.[1] ?? "" };
  }
  // `export function Foo` / `export const Foo =` / `export class Foo` (PascalCase = component)
  const named = content.match(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Z]\w+)/);
  if (named) return { kind: "named", name: named[1] };
  return null;
}

export async function autoWireFeature(opts: {
  paths: string[];
  written: string[];
  readFile: (p: string) => Promise<string | null>;
  writeFiles: (files: { path: string; content: string }[]) => Promise<unknown>;
}): Promise<string | null> {
  const { paths, written, readFile, writeFiles } = opts;

  // Only the premium Next.js skeleton has this landing-page trap.
  const entry = paths.find((p) => /app\/\(app\)\/dashboard\/page\.(t|j)sx$/.test(p));
  if (!entry) return null;

  // Feature components the model wrote this turn — any .tsx/.jsx that isn't the
  // UI kit, the shipped chrome, or a route/layout (those live under app/ and
  // can't be "mounted"; the user's MVC view often sits in lib/mvc/views/).
  const candidates = written.filter(
    (p) =>
      /\.(t|j)sx$/.test(p) &&
      !/(^|\/)components\/ui\//.test(p) &&
      !TEMPLATE_COMPONENTS.test(p) &&
      !/(^|\/)app\//.test(p),
  );
  if (candidates.length === 0) return null;

  // Is any candidate already imported by a page? If so the model wired it — leave
  // everything alone.
  const pageFiles = paths.filter((p) => /app\/.*page\.(t|j)sx$/.test(p) || /app\/.*layout\.(t|j)sx$/.test(p));
  const pageSources = await Promise.all(pageFiles.map((p) => readFile(p)));
  const allPageSrc = pageSources.filter(Boolean).join("\n");
  const isWired = (file: string) => {
    const stem = file.replace(/\.(t|j)sx?$/i, "");
    const noExt = baseName(stem);
    // import "@/components/calendar/calendar-app" or a relative path ending in it
    return new RegExp(`["'\`][^"'\`]*${noExt}["'\`]`).test(allPageSrc);
  };
  if (candidates.some(isWired)) return null;

  // Rank candidates so the most likely "main" component wins, then pick the first
  // that actually exports a renderable component.
  const score = (p: string) => {
    const b = baseName(p).toLowerCase();
    let s = 0;
    if (/(^|\/)components\//.test(p)) s += 2;
    if (/\bapp\b|app\.|main\./.test(b)) s += 3;
    if (/view|home|index|app|board|calendar|dashboard/.test(b)) s += 1;
    return s;
  };
  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  let main: string | null = null;
  let exp: { kind: "default" | "named"; name: string } | null = null;
  for (const p of ranked) {
    const c = await readFile(p);
    if (!c) continue;
    const e = detectExport(c);
    if (e) {
      main = p;
      exp = e;
      break;
    }
  }
  if (!main || !exp) return null;

  const modulePath = "@/" + main.replace(/\.(t|j)sx?$/i, "");
  const importName = exp.kind === "default" ? exp.name || pascal(main) : exp.name;
  const importLine =
    exp.kind === "default"
      ? `import ${importName} from "${modulePath}";`
      : `import { ${importName} } from "${modulePath}";`;

  const page = `"use client";

// Auto-mounted: the app's main feature is rendered on the page users land on.
${importLine}

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <${importName} />
    </div>
  );
}
`;

  await writeFiles([{ path: entry, content: page }]);
  return entry;
}
