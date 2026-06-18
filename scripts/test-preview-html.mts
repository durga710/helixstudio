// Verifies the static preview composer: preserves type="module" (the blank-page
// bug), resolves ../ paths, inlines css/js, and shims storage.
//   npx tsx scripts/test-preview-html.mts
import { composePreviewHtml } from "../src/lib/preview-html.js";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string) => { c ? (pass++, console.log("  PASS", label)) : (fail++, console.log("  FAIL", label)); };

// 1. type="module" preserved when inlining.
{
  const files: Record<string, string> = {
    "index.html": `<!doctype html><head></head><body><div id=app></div>\n<script type="module" src="app.js"></script></body>`,
    "app.js": `import { go } from "./x.js"; go();`,
  };
  const out = await composePreviewHtml("index.html", async (p) => files[p] ?? null);
  ok(!!out, "composes");
  ok(/<script type="module">/.test(out!.html), "preserves type=module on inlined script");
  ok(out!.html.includes("go();"), "inlines the module body");
  ok(out!.html.includes("localStorage"), "injects the storage shim");
}

// 2. classic script stays classic.
{
  const files: Record<string, string> = {
    "index.html": `<head></head><body><script src="main.js"></script></body>`,
    "main.js": `console.log(1)`,
  };
  const out = await composePreviewHtml("index.html", async (p) => files[p] ?? null);
  ok(/<script>\nconsole\.log\(1\)/.test(out!.html), "classic script has no type=module");
}

// 3. ../ path resolution from a nested entry.
{
  const files: Record<string, string> = {
    "pages/index.html": `<head><link rel="stylesheet" href="../css/site.css"></head><body><script src="../js/app.js"></script></body>`,
    "css/site.css": `body{color:red}`,
    "js/app.js": `var ok=1`,
  };
  const out = await composePreviewHtml("pages/index.html", async (p) => files[p] ?? null);
  ok(out!.html.includes("body{color:red}"), "resolves ../css via normalize");
  ok(out!.html.includes("var ok=1"), "resolves ../js via normalize");
}

console.log(`\n=== preview-html: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
