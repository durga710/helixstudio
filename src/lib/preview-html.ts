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
  // Collapse "." and ".." segments so refs like "../js/app.js" resolve correctly.
  const normalize = (path: string) => {
    const out: string[] = [];
    for (const seg of path.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") out.pop();
      else out.push(seg);
    }
    return out.join("/");
  };
  const resolve = (ref: string) => {
    let p = ref.startsWith("./") ? ref.slice(2) : ref;
    if (p.startsWith("/")) p = p.slice(1);
    else p = baseDir + p;
    return normalize(p);
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
      // Escape any literal "</style" in the CSS so it can't close the tag early.
      html = html.replace(m[0], `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`);
      inlined.push(m[1]!);
    }
  }

  // <script src="app.js"></script> → <script>…</script>. CRITICAL: preserve
  // type="module" — dropping it turns module code (import/export) into a classic
  // script that throws "Cannot use import statement outside a module" and renders
  // a blank page. This was the #1 "nothing shows up" bug.
  const scriptRe = /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
  const scripts = Array.from(html.matchAll(scriptRe)).filter((m) => isLocalRef(m[1]!));
  for (const m of scripts) {
    const js = await getFile(resolve(m[1]!));
    if (js !== null) {
      const isModule = /\btype\s*=\s*["']?module["']?/i.test(m[0]);
      // Escape any literal "</script" in the JS so a string/regex containing it
      // can't close the tag early (the rest would leak as HTML → blank page).
      html = html.replace(
        m[0],
        `<script${isModule ? ' type="module"' : ""}>\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`,
      );
      inlined.push(m[1]!);
    }
  }

  // The preview iframe is sandboxed to a unique opaque origin, where touching
  // localStorage/sessionStorage throws a SecurityError — which blanks any app
  // that persists state (a calendar saving events, a todo list, …). Shim them
  // with an in-memory store ONLY when the real ones are unavailable, so those
  // apps run instead of crashing. Injected first so it's in place before app code.
  const storageShim =
    "<script>(function(){try{window.localStorage.getItem('_helix');}catch(e){" +
    "var mk=function(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null;}," +
    "setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}," +
    "key:function(i){return Object.keys(m)[i]||null;},get length(){return Object.keys(m).length;}};};" +
    "try{Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});}catch(_){}" +
    "try{Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true});}catch(_){}}})();</script>";
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + storageShim) : storageShim + html;

  // Keyboard input only reaches a game if the iframe's document is focused.
  // Inject a tiny helper that focuses the canvas/window on load and on any click
  // inside the preview, so arrow keys etc. work without the user hunting for focus.
  const focusHelper =
    "<script>(function(){function f(){try{var c=document.querySelector('canvas');" +
    "if(c){if(!c.hasAttribute('tabindex'))c.setAttribute('tabindex','0');c.focus();}" +
    "if(window.focus)window.focus();}catch(e){}}" +
    "window.addEventListener('load',f);document.addEventListener('pointerdown',f);})();</script>";
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, focusHelper + "</body>") : html + focusHelper;

  return { html, inlined };
}
