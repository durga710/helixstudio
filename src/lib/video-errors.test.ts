/**
 * HelixVideo error-branding tests. Run:
 *   node --experimental-strip-types --test src/lib/video.test.ts
 *
 * The white-label promise is that users never see provider/billing internals,
 * so every raw OpenAI error must map to a branded HelixVideo message and never
 * echo words like "OpenAI", "Sora", "billing", or "quota".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { brandVideoMessage, sanitizeVideoError } from "./video-errors.ts";

const LEAKY = /openai|sora|gpt|billing|quota|hard limit|insufficient/i;

test("brandVideoMessage: the billing hard-limit leak becomes a capacity message", () => {
  // This is the exact string the SDK surfaced in the bug report.
  const out = brandVideoMessage("400 Billing hard limit has been reached.", 400, "fallback");
  assert.equal(out, "HelixVideo is temporarily at capacity. Please try again later.");
  assert.doesNotMatch(out, LEAKY);
});

test("brandVideoMessage: quota / insufficient credit also map to capacity", () => {
  for (const raw of [
    "You exceeded your current quota, please check your plan and billing details.",
    "Insufficient credit balance.",
    "Your account is out of credits.",
  ]) {
    const out = brandVideoMessage(raw, 429, "fallback");
    assert.match(out, /capacity|busy/);
    assert.doesNotMatch(out, LEAKY);
  }
});

test("brandVideoMessage: 429 rate limit maps to a busy message", () => {
  const out = brandVideoMessage("Rate limit reached for requests", 429, "fallback");
  assert.equal(out, "HelixVideo is busy right now — please try again in a moment.");
});

test("brandVideoMessage: moderation rejections map to a prompt message", () => {
  const out = brandVideoMessage("Your request was rejected by our content policy.", 400, "fallback");
  assert.equal(out, "That prompt couldn't be used. Try describing a different shot.");
  assert.doesNotMatch(out, LEAKY);
});

test("brandVideoMessage: unknown errors fall back to the provided message", () => {
  assert.equal(brandVideoMessage("some unexpected transport blip", undefined, "Couldn't start the video."),
    "Couldn't start the video.");
  assert.equal(brandVideoMessage("", undefined, "Couldn't start the video."), "Couldn't start the video.");
});

test("sanitizeVideoError: brands an Error and never throws on odd input", () => {
  const err = Object.assign(new Error("400 Billing hard limit has been reached."), { status: 400 });
  assert.equal(sanitizeVideoError(err, "fallback"), "HelixVideo is temporarily at capacity. Please try again later.");
  assert.equal(sanitizeVideoError(null, "fallback"), "fallback");
  assert.equal(sanitizeVideoError({ nope: true }, "fallback"), "fallback");
});
