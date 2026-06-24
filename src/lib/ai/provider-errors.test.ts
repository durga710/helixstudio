/**
 * Generic provider-error branding tests. Run:
 *   node --experimental-strip-types --test src/lib/ai/provider-errors.test.ts
 *
 * Invariant (QA-2026-06-23 H3): raw provider/billing internals never reach the
 * user via the agent/chat error event, but genuine app messages pass through.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { brandProviderError } from "./provider-errors.ts";

const LEAKY = /anthropic|openai|bedrock|sora|gpt|billing|quota|hard limit|insufficient|x-api-key/i;

test("billing hard-limit text is branded and leaks nothing", () => {
  const out = brandProviderError("400 Billing hard limit has been reached.");
  assert.match(out, /temporarily at capacity/i);
  assert.doesNotMatch(out, LEAKY);
});

test("insufficient_quota from a provider is branded", () => {
  assert.doesNotMatch(brandProviderError("insufficient_quota: you exceeded your current quota"), LEAKY);
});

test("rate-limit text maps to a busy message", () => {
  assert.match(brandProviderError("429 Too Many Requests"), /busy/i);
});

test("a raw provider/SDK signature is replaced even without a billing keyword", () => {
  assert.doesNotMatch(brandProviderError("Anthropic API error: overloaded_error"), LEAKY);
  assert.doesNotMatch(brandProviderError("openai.APIError: model gpt-5.x unavailable"), LEAKY);
});

test("a genuine app-level message passes through unchanged", () => {
  assert.equal(brandProviderError("Nothing to push — no changes against the base branch."),
    "Nothing to push — no changes against the base branch.");
  assert.equal(brandProviderError("Your changes conflict with new commits on main."),
    "Your changes conflict with new commits on main.");
});

test("empty/undefined yields a safe generic message", () => {
  assert.match(brandProviderError(undefined), /try again/i);
  assert.match(brandProviderError(""), /try again/i);
});
