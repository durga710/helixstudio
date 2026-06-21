/**
 * Key-resolution tests (house OpenAI mode). Run:
 *   node --experimental-strip-types --test src/lib/ai/keys.test.ts
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openaiHouseForAll, defaultAiProvider, resolveAiKey, canUseHelix } from "./keys.ts";

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

test("canUseHelix: admins + pro/team yes; free + guests no", () => {
  assert.equal(canUseHelix({ isAdmin: true }), true);
  assert.equal(canUseHelix({ tier: "pro" }), true);
  assert.equal(canUseHelix({ tier: "team" }), true);
  assert.equal(canUseHelix({ tier: "free" }), false);
  assert.equal(canUseHelix({ tier: "pro", isGuest: true }), false); // guests never premium
  assert.equal(canUseHelix({}), false);
});

test("defaultAiProvider: PREMIUM + house OpenAI wins; free falls to Gunner (bedrock)", () => {
  delete process.env.OPENAI_FOR_ALL;
  delete process.env.OPENAI_API_KEY;
  assert.equal(defaultAiProvider(true, true), "bedrock"); // no house → bedrock
  assert.equal(defaultAiProvider(false, true), "openai");
  process.env.OPENAI_FOR_ALL = "1";
  process.env.OPENAI_API_KEY = "sk-test";
  assert.equal(defaultAiProvider(true, true), "openai"); // premium + house → Helix
  assert.equal(defaultAiProvider(true, false), "bedrock"); // free → Gunner even with house
});

test("resolveAiKey: user's own key always wins", () => {
  process.env.OPENAI_FOR_ALL = "1";
  process.env.OPENAI_API_KEY = "sk-house";
  assert.equal(resolveAiKey({ provider: "openai", userKey: "sk-mine", isAdmin: false }), "sk-mine");
});

test("resolveAiKey: house OpenAI key serves a PREMIUM non-admin (trimmed), not a free one", () => {
  process.env.OPENAI_FOR_ALL = "1";
  process.env.OPENAI_API_KEY = "sk-house\n"; // trailing newline from a paste
  assert.equal(resolveAiKey({ provider: "openai", userKey: null, isAdmin: false, premium: true }), "sk-house");
  // Free user (premium:false) gets no house key — they're limited to Gunner.
  assert.equal(resolveAiKey({ provider: "openai", userKey: null, isAdmin: false, premium: false }), undefined);
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
