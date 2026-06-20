/**
 * build-log extractor tests. Run:
 *   node --experimental-strip-types --test src/lib/build-log.test.ts
 *
 * The headline fixture is the REAL noisy Next.js transcript from the engine's
 * casing-collision failure — we assert we keep the error and drop the chrome.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBuildError } from "./build-log.ts";

const REAL_NEXT_LOG = `> foodtrack@0.1.0 build
> next build

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...

   We detected TypeScript in your project and reconfigured your tsconfig.json file for you. Strict-mode is set to false by default.
   The following suggested values were added to your tsconfig.json. These values can be changed to fit your project's needs:

       - include was updated to add '.next/types/**/*.ts'
       - plugins was updated to add { name: 'next' }
Failed to compile.

./app/(app)/layout.tsx:10:21
Type error: Already included file name '/vercel/sandbox/src/components/sidebar.tsx' differs from file name '/vercel/sandbox/src/components/Sidebar.tsx' only in casing.
  The file is in the program because:
    Imported via "@/components/sidebar" from file '/vercel/sandbox/app/(app)/layout.tsx'

   8 | import { getUser, type User } from "@/lib/auth";
   9 | import { APP_NAME } from "@/lib/config";
> 10 | import Sidebar from "@/components/sidebar";
     |                     ^
  11 | import Topbar from "@/components/topbar";`;

test("keeps the compile error, drops the build chrome", () => {
  const out = extractBuildError(REAL_NEXT_LOG);
  assert.match(out, /Failed to compile/);
  assert.match(out, /only in casing/);
  assert.match(out, /layout\.tsx:10:21/);
  // chrome is gone
  assert.doesNotMatch(out, /Creating an optimized production build/);
  assert.doesNotMatch(out, /reconfigured your tsconfig/);
  assert.doesNotMatch(out, /foodtrack@0\.1\.0 build/);
});

test("massively shrinks the payload", () => {
  const out = extractBuildError(REAL_NEXT_LOG);
  assert.ok(out.length < REAL_NEXT_LOG.length * 0.7, `expected a real cut, got ${out.length}/${REAL_NEXT_LOG.length}`);
});

test("extracts a bare tsc error frame", () => {
  const log = `src/app/page.tsx(12,5): error TS2304: Cannot find name 'Foo'.\nsrc/app/page.tsx(20,1): error TS1005: ';' expected.`;
  const out = extractBuildError(log);
  assert.match(out, /TS2304/);
  assert.match(out, /Cannot find name 'Foo'/);
});

test("falls back to de-noised tail when no structured error", () => {
  const log = `   Creating an optimized production build ...\nsome unrecognized failure happened\n   info  - done`;
  const out = extractBuildError(log);
  assert.match(out, /some unrecognized failure happened/);
  assert.doesNotMatch(out, /Creating an optimized production build/);
});

test("empty log yields empty string, never throws", () => {
  assert.equal(extractBuildError(""), "");
});

test("caps very long error regions", () => {
  const huge = "Failed to compile.\n" + Array.from({ length: 500 }, (_, i) => `./file${i}.tsx:1:1 error TS2304: x`).join("\n");
  const out = extractBuildError(huge);
  assert.ok(out.length <= 2_500, `expected cap, got ${out.length}`);
});
