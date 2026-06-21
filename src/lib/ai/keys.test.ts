/**
 * Key-resolution tests (house OpenAI mode). Run:
 *   node --experimental-strip-types --test src/lib/ai/keys.test.ts
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openaiHouseForAll, defaultAiProvider, resolveAiKey } from "./keys.ts";

const ENV = { ...process.env };
afterEach(() => {
  // Restore env between tests.
  for (const k of ["OPENAI_FOR_ALL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];
  Object.assign(process.env, ENV);
});

test("openaiHouseForAll: needs both the flag and a non-empty key", () => {
  delete process.env.OPENAI_FOR_ALL;
  delete process.env.OPENAI_API_KEY;
  assert.equal(openaiHouseForAll(), false);
  process.env.OPENAI_FOR_ALL = "1";
  assert.equal(openaiHouseForAll(), false); // no key
  process.env.OPENAI_API_KEY = "  "; // whitespace only → still off
  assert.equal(openaiHouseForAll(), false);
  process.env.OPENAI_API_KEY = "sk-test";
  assert.equal(openaiHouseForAll(), true);
});

test("defaultAiProvider: house OpenAI wins, else Bedrock if wired, else OpenAI", () => {
  delete process.env.OPENAI_FOR_ALL;
  delete process.env.OPENAI_API_KEY;
  assert.equal(defaultAiProvider(true), "bedrock");
  assert.equal(defaultAiProvider(false), "openai");
  process.env.OPENAI_FOR_ALL = "1";
  process.env.OPENAI_API_KEY = "sk-test";
  assert.equal(defaultAiProvider(true), "openai"); // house beats bedrock
});

test("resolveAiKey: user's own key always wins", () => {
  process.env.OPENAI_FOR_ALL = "1";
  process.env.OPENAI_API_KEY = "sk-house";
  assert.equal(resolveAiKey({ provider: "openai", userKey: "sk-mine", isAdmin: false }), "sk-mine");
});

test("resolveAiKey: house OpenAI key serves a non-admin when enabled (trimmed)", () => {
  process.env.OPENAI_FOR_ALL = "1";
  process.env.OPENAI_API_KEY = "sk-house\n"; // trailing newline from a paste
  assert.equal(resolveAiKey({ provider: "openai", userKey: null, isAdmin: false }), "sk-house");
});

test("resolveAiKey: without house mode, a non-admin gets no platform key", () => {
  delete process.env.OPENAI_FOR_ALL;
  process.env.OPENAI_API_KEY = "sk-house";
  assert.equal(resolveAiKey({ provider: "openai", userKey: null, isAdmin: false }), undefined);
  // admins still get it
  assert.equal(resolveAiKey({ provider: "openai", userKey: null, isAdmin: true }), "sk-house");
});

test("resolveAiKey: house mode is OpenAI-only — other providers stay admin-gated", () => {
  process.env.OPENAI_FOR_ALL = "1";
  process.env.OPENAI_API_KEY = "sk-house";
  process.env.ANTHROPIC_API_KEY = "sk-ant";
  assert.equal(resolveAiKey({ provider: "anthropic", userKey: null, isAdmin: false }), undefined);
});

test("resolveAiKey: local falls back to a dummy key for everyone", () => {
  assert.equal(resolveAiKey({ provider: "local", userKey: null, isAdmin: false }), "local");
});
