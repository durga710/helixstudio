import { test } from "node:test";
import assert from "node:assert/strict";
import { composePreviewHtml } from "./preview-html.ts";

function mockFiles(files: Record<string, string>) {
  return async (path: string): Promise<string | null> => (path in files ? files[path] : null);
}

test("bundles a multi-module static app through an import map", async () => {
  const files = {
    "index.html":
      `<!doctype html><html><head><title>t</title></head>` +
      `<body><script type="module" src="app.js"></script></body></html>`,
    "app.js": `import { greet } from "./lib/util.js";\ngreet();`,
    "lib/util.js": `import { name } from "../config.js";\nexport function greet(){ document.body.textContent = name; }`,
    "config.js": `export const name = "Hello";`,
  };
  const out = await composePreviewHtml("index.html", mockFiles(files));
  assert.ok(out, "composed something");
  const html = out!.html;

  // One import map is injected.
  assert.match(html, /<script type="importmap">/);
  // The entry module's relative import is rewritten to a stable key.
  assert.match(html, /import \{ greet \} from "@helixmod\/lib\/util\.js"/);
  // Both reachable modules are served as data: URLs in the map.
  assert.match(html, /@helixmod\/lib\/util\.js"\s*:\s*"data:text\/javascript/);
  assert.match(html, /@helixmod\/config\.js"\s*:\s*"data:text\/javascript/);
  // A nested module's own import is rewritten too (encoded inside its data: URL).
  assert.ok(html.includes("%40helixmod%2Fconfig.js"), "nested import rewritten to its key");
});

test("a single-file module needs no import map", async () => {
  const files = {
    "index.html": `<html><head></head><body><script type="module" src="app.js"></script></body></html>`,
    "app.js": `document.body.textContent = "hi";`,
  };
  const out = await composePreviewHtml("index.html", mockFiles(files));
  assert.ok(out);
  assert.doesNotMatch(out!.html, /importmap/);
});

test("a cyclic import graph still resolves without hanging", async () => {
  const files = {
    "index.html": `<html><head></head><body><script type="module" src="a.js"></script></body></html>`,
    "a.js": `import { b } from "./b.js";\nexport const a = 1;\nconsole.log(b);`,
    "b.js": `import { a } from "./a.js";\nexport const b = 2;\nconsole.log(a);`,
  };
  const out = await composePreviewHtml("index.html", mockFiles(files));
  assert.ok(out, "did not hang on the cycle");
  assert.match(out!.html, /<script type="importmap">/);
  assert.match(out!.html, /@helixmod\/b\.js"\s*:\s*"data:text\/javascript/);
});
