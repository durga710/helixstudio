/**
 * Deterministic-fixer tests. Run with Node's built-in runner (no extra deps):
 *   node --experimental-strip-types --test src/lib/fixers/index.test.ts
 *
 * The two headline cases mirror the real engine failures these fixers exist to
 * kill: a casing loop on `Sidebar.tsx` vs `sidebar`, and a crash from importing
 * a named symbol a module defined but never exported (`DataTable`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDeterministicFixes, aliasesFromTsconfig, DEFAULT_ALIASES } from "./index.ts";

test("import-casing: rewrites an alias import whose case mismatches the file", () => {
  const files = {
    "src/components/Sidebar.tsx": "export default function Sidebar() { return null; }\n",
    "app/(app)/layout.tsx": `import Sidebar from "@/components/sidebar";\nexport default function L() { return <Sidebar/>; }\n`,
  };
  const out = runDeterministicFixes(files);
  assert.equal(out.fixes.length, 1);
  assert.equal(out.fixes[0].kind, "import-casing");
  assert.match(out.changed["app/(app)/layout.tsx"], /@\/components\/Sidebar/);
  assert.doesNotMatch(out.changed["app/(app)/layout.tsx"], /@\/components\/sidebar/);
});

test("import-casing: rewrites a relative import with wrong case", () => {
  const files = {
    "src/lib/Utils.ts": "export const x = 1;\n",
    "src/app/page.tsx": `import { x } from "./../lib/utils";\nconsole.log(x);\n`,
  };
  const out = runDeterministicFixes(files);
  assert.equal(out.fixes[0].kind, "import-casing");
  assert.match(out.changed["src/app/page.tsx"], /lib\/Utils/);
});

test("import-casing: leaves a correctly-cased import untouched", () => {
  const files = {
    "src/components/Sidebar.tsx": "export default function Sidebar() {}\n",
    "src/app/page.tsx": `import Sidebar from "@/components/Sidebar";\n`,
  };
  const out = runDeterministicFixes(files);
  assert.equal(out.fixes.length, 0);
  assert.deepEqual(out.changed, {});
});

test("import-casing: does NOT touch an ambiguous case collision", () => {
  const files = {
    "src/components/Sidebar.tsx": "export default function Sidebar() {}\n",
    "src/components/sidebar.tsx": "export default function sidebar() {}\n",
    "src/app/page.tsx": `import X from "@/components/SIDEBAR";\n`,
  };
  const out = runDeterministicFixes(files);
  assert.equal(out.fixes.length, 0); // two case-insensitive matches → unsafe, skip
});

test("missing-export: adds `export` to a defined-but-unexported symbol", () => {
  const files = {
    "src/components/ui/data-table.tsx": `"use client";\nfunction DataTable() { return null; }\nexport default DataTable;\n`,
    "src/app/dashboard/page.tsx": `import { DataTable } from "@/components/ui/data-table";\n`,
  };
  const out = runDeterministicFixes(files);
  const fix = out.fixes.find((f) => f.kind === "missing-export");
  assert.ok(fix, "expected a missing-export fix");
  assert.match(out.changed["src/components/ui/data-table.tsx"], /export function DataTable/);
});

test("missing-export: no-op when the symbol is already exported", () => {
  const files = {
    "src/lib/api.ts": "export function getUser() {}\n",
    "src/app/page.tsx": `import { getUser } from "@/lib/api";\n`,
  };
  const out = runDeterministicFixes(files);
  assert.equal(out.fixes.length, 0);
});

test("missing-export: leaves a genuinely-absent symbol to the model", () => {
  const files = {
    "src/lib/api.ts": "export function getUser() {}\n",
    "src/app/page.tsx": `import { getNonexistent } from "@/lib/api";\n`,
  };
  const out = runDeterministicFixes(files);
  assert.equal(out.fixes.length, 0); // symbol not defined → not auto-fixable
});

test("missing-export: handles `export { x as name }` re-exports", () => {
  const files = {
    "src/lib/mod.ts": "function impl() {}\nexport { impl as doThing };\n",
    "src/app/page.tsx": `import { doThing } from "@/lib/mod";\n`,
  };
  const out = runDeterministicFixes(files);
  assert.equal(out.fixes.length, 0); // already exported under that name
});

test("bare/package imports are never touched", () => {
  const files = {
    "src/app/page.tsx": `import React from "react";\nimport { z } from "zod";\n`,
  };
  const out = runDeterministicFixes(files);
  assert.deepEqual(out.changed, {});
});

test("aliasesFromTsconfig: parses compilerOptions.paths", () => {
  const a = aliasesFromTsconfig(`{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }`);
  assert.deepEqual(a, { "@/": ["src/"] });
});

test("aliasesFromTsconfig: tolerates comments/trailing commas, falls back on junk", () => {
  const a = aliasesFromTsconfig(`{ // tsconfig\n "compilerOptions": { "paths": { "~/*": ["app/*"], } }, }`);
  assert.deepEqual(a, { "~/": ["app/"] });
  assert.deepEqual(aliasesFromTsconfig("not json"), DEFAULT_ALIASES);
});

test("combined: casing fix and missing-export fix apply together", () => {
  const files = {
    "src/components/Card.tsx": `"use client";\nfunction Card() { return null; }\nexport default Card;\n`,
    "src/app/page.tsx": `import { Card } from "@/components/card";\n`,
  };
  const out = runDeterministicFixes(files);
  // import casing corrected in page.tsx, AND Card exported in Card.tsx
  assert.match(out.changed["src/app/page.tsx"], /@\/components\/Card/);
  assert.match(out.changed["src/components/Card.tsx"], /export function Card/);
});
