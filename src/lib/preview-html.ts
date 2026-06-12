/**
 * Static-app preview composer (client-safe, pure).
 *
 * Takes an entry HTML file and inlines its RELATIVE css/js references from
 * workspace files, so a multi-file static app runs inside ONE sandboxed
 * iframe via srcDoc. Shared by the studio's Preview tab and the /build
 * live-preview pane so the two can't drift apart.
 */

export interface ComposedPreview {
  html: string;
  /** Relative refs that were successfully inlined. */
  inlined: string[];
}

/** The preview entry: prefer the selected HTML file, else index.html (root
 * first, then nested), else the first HTML file. Null = nothing previewable. */
export function pickPreviewEntry(paths: string[], selected?: string | null): string | null {
  const htmlPaths = paths.filter((p) => p.toLowerCase().endsWith(".html"));
  if (selected?.toLowerCase().endsWith(".html")) return selected;
  return (
    htmlPaths.find((p) => p === "index.html") ??
    htmlPaths.find((p) => /(^|\/)index\.html$/.test(p)) ??
    htmlPaths[0] ??
    null
  );
}

export async function composePreviewHtml(
  entry: string,
  getFile: (path: string) => Promise<string | null>,
): Promise<ComposedPreview | null> {
  let html = await getFile(entry);
  if (html === null) return null;

  const baseDir = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/") + 1) : "";
  const resolve = (ref: string) => {
    let p = ref.startsWith("./") ? ref.slice(2) : ref;
    if (p.startsWith("/")) p = p.slice(1);
    else p = baseDir + p;
    return p;
  };
  const isLocalRef = (ref: string) =>
    Boolean(ref) && !/^([a-z]+:)?\/\//i.test(ref) && !ref.startsWith("data:") && !ref.startsWith("#");

  const inlined: string[] = [];

  // <link rel="stylesheet" href="style.css"> → <style>…</style>
  const linkRe = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const links = Array.from(html.matchAll(linkRe)).filter(
    (m) => /stylesheet/i.test(m[0]) && isLocalRef(m[1]!),
  );
  for (const m of links) {
    const css = await getFile(resolve(m[1]!));
    if (css !== null) {
      html = html.replace(m[0], `<style>\n${css}\n</style>`);
      inlined.push(m[1]!);
    }
  }

  // <script src="app.js"></script> → <script>…</script>
  const scriptRe = /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
  const scripts = Array.from(html.matchAll(scriptRe)).filter((m) => isLocalRef(m[1]!));
  for (const m of scripts) {
    const js = await getFile(resolve(m[1]!));
    if (js !== null) {
      html = html.replace(m[0], `<script>\n${js}\n</script>`);
      inlined.push(m[1]!);
    }
  }

  return { html, inlined };
}
