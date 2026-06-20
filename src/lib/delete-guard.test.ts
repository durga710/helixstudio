/**
 * delete-storm guard tests. Run:
 *   node --experimental-strip-types --test src/lib/delete-guard.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDeleteStorm, deleteCap, DELETE_ABS_FLOOR } from "./delete-guard.ts";

test("deleteCap: small projects get the absolute floor", () => {
  assert.equal(deleteCap(4), DELETE_ABS_FLOOR); // ceil(0.5*4)=2 < 12
  assert.equal(deleteCap(0), DELETE_ABS_FLOOR);
});

test("deleteCap: large projects scale with the fraction", () => {
  assert.equal(deleteCap(100), 50);
  assert.equal(deleteCap(40), 20);
});

test("allows a normal small refactor", () => {
  const v = checkDeleteStorm({ treeSizeAtStart: 30, deletedThisTurn: 2 }, 1);
  assert.equal(v.allowed, true);
});

test("blocks the runaway disaster (delete the whole app)", () => {
  const v = checkDeleteStorm({ treeSizeAtStart: 100, deletedThisTurn: 50 }, 1);
  assert.equal(v.allowed, false);
  assert.match(v.reason ?? "", /Refusing to delete/);
  assert.match(v.reason ?? "", /correct the actual error/);
});

test("blocks deleting a small project wholesale", () => {
  // 20-file scaffold (cap 12); the engineer tries to delete a 13th this turn.
  const v = checkDeleteStorm({ treeSizeAtStart: 20, deletedThisTurn: 12 }, 1);
  assert.equal(v.allowed, false);
});

test("boundary: exactly at the cap is allowed, one over is blocked", () => {
  assert.equal(checkDeleteStorm({ treeSizeAtStart: 100, deletedThisTurn: 49 }, 1).allowed, true); // 50 == cap
  assert.equal(checkDeleteStorm({ treeSizeAtStart: 100, deletedThisTurn: 50 }, 1).allowed, false); // 51 > cap
});

test("multi-file delete in one call is counted", () => {
  const v = checkDeleteStorm({ treeSizeAtStart: 20, deletedThisTurn: 0 }, 13);
  assert.equal(v.allowed, false); // 13 > floor of 12
  assert.equal(checkDeleteStorm({ treeSizeAtStart: 20, deletedThisTurn: 0 }, 12).allowed, true);
});
