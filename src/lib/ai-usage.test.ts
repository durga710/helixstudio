/**
 * Reserve/reconcile accounting tests (QA-2026-06-23 H4). Run:
 *   node --experimental-strip-types --test src/lib/ai-usage.test.ts
 *
 * Invariant: a turn that reserves R tokens at the gate and truly spends A must
 * leave the metered counter moved by exactly A — the gate added R, so recording
 * settles the remaining (A - R), which may be negative or a pure refund. This is
 * what closes the concurrent-turn quota race without over- or under-billing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { usageAccounting } from "./usage-accounting.ts";

test("no reservation: counter moves by the full spend, event written", () => {
  const { counterDelta, writeEvent } = usageAccounting(1200, 0);
  assert.equal(counterDelta, 1200);
  assert.equal(writeEvent, true);
});

test("reserve + actual: net counter movement equals the true spend", () => {
  const reserved = 16_000;
  const actual = 9_500;
  const { counterDelta } = usageAccounting(actual, reserved);
  // Gate already added `reserved`; reconcile adds the delta → net == actual.
  assert.equal(reserved + counterDelta, actual);
  assert.equal(counterDelta, -6_500); // came in under reserve → settle down
});

test("actual above reserve: delta is positive, net still equals actual", () => {
  const reserved = 16_000;
  const actual = 22_000;
  const { counterDelta, writeEvent } = usageAccounting(actual, reserved);
  assert.equal(reserved + counterDelta, actual);
  assert.equal(counterDelta, 6_000);
  assert.equal(writeEvent, true);
});

test("zero spend after a reservation: pure refund, no history row", () => {
  const reserved = 16_000;
  const { counterDelta, writeEvent } = usageAccounting(0, reserved);
  // Net movement must be zero (gate added reserved, this removes it).
  assert.equal(reserved + counterDelta, 0);
  assert.equal(counterDelta, -16_000);
  assert.equal(writeEvent, false); // a 0-token turn never writes a usage row
});

test("exact-estimate turn: no counter movement, event still written", () => {
  const { counterDelta, writeEvent } = usageAccounting(16_000, 16_000);
  assert.equal(counterDelta, 0);
  assert.equal(writeEvent, true);
});
