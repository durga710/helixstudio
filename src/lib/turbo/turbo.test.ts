/**
 * Turbo pure-helper tests. Run:
 *   node --experimental-strip-types --test src/lib/turbo/turbo.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManifest, parseFileReply, buildWorkerUser, runPool } from "./parse.ts";

test("parseManifest: parses a well-formed manifest", () => {
  const text = `Here you go:\n{"contract":"type Food = { id: string }","files":[{"path":"src/app/page.tsx","spec":"the home page"},{"path":"src/lib/types.ts","spec":"shared types"}]}`;
  const m = parseManifest(text);
  assert.ok(m);
  assert.equal(m.contract, "type Food = { id: string }");
  assert.equal(m.files.length, 2);
  assert.equal(m.files[0].path, "src/app/page.tsx");
});

test("parseManifest: dedupes paths and strips leading slashes / traversal", () => {
  const text = `{"contract":"x","files":[{"path":"/src/a.ts","spec":"a"},{"path":"src/a.ts","spec":"dup"},{"path":"../evil.ts","spec":"no"}]}`;
  const m = parseManifest(text);
  assert.ok(m);
  assert.equal(m.files.length, 1);
  assert.equal(m.files[0].path, "src/a.ts");
});

test("parseManifest: returns null on junk or empty file list", () => {
  assert.equal(parseManifest("not json"), null);
  assert.equal(parseManifest(`{"contract":"x","files":[]}`), null);
  assert.equal(parseManifest(`{"contract":"x"}`), null);
});

test("parseFileReply: extracts a fenced code block", () => {
  const reply = "Sure, here's the file:\n```tsx\nexport const x = 1;\n```\nDone!";
  assert.equal(parseFileReply(reply), "export const x = 1;");
});

test("parseFileReply: accepts raw code when unfenced", () => {
  assert.equal(parseFileReply("export const y = 2;\n"), "export const y = 2;");
});

test("parseFileReply: rejects an apology / empty", () => {
  assert.equal(parseFileReply("Sorry, I can't do that."), null);
  assert.equal(parseFileReply("   "), null);
  assert.equal(parseFileReply("```\n```"), null);
});

test("buildWorkerUser: includes contract, file list, and the target spec", () => {
  const manifest = { contract: "TYPE_CONTRACT", files: [{ path: "a.ts", spec: "A" }, { path: "b.ts", spec: "B" }] };
  const out = buildWorkerUser(manifest, manifest.files[0], "build an app", "NOTES");
  assert.match(out, /TYPE_CONTRACT/);
  assert.match(out, /- a\.ts/);
  assert.match(out, /- b\.ts/);
  assert.match(out, /YOUR FILE: a\.ts/);
  assert.match(out, /NOTES/);
});

test("runPool: preserves order and bounds concurrency", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = await runPool(items, 3, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60, 70, 80]);
  assert.ok(maxInFlight <= 3, `concurrency exceeded: ${maxInFlight}`);
});

test("runPool: handles an empty list", async () => {
  const out = await runPool([], 4, async (x) => x);
  assert.deepEqual(out, []);
});
