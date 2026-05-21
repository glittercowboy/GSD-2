/**
 * est-annotation-timeout.test.ts — Regression tests for #2243.
 *
 * Tasks with `est: 30m` or `est: 2h` annotations should get extended
 * supervision timeouts. The parseEstimateMinutes helper should parse
 * estimate strings, and startUnitSupervision should use them.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseEstimateMinutes, resolveUnitSupervisionTimeouts } from "../auto-timers.ts";

test("#2243: parseEstimateMinutes parses '30m' correctly", () => {
  assert.equal(parseEstimateMinutes("30m"), 30);
});

test("#2243: parseEstimateMinutes parses '2h' correctly", () => {
  assert.equal(parseEstimateMinutes("2h"), 120);
});

test("#2243: parseEstimateMinutes parses '1h30m' correctly", () => {
  assert.equal(parseEstimateMinutes("1h30m"), 90);
});

test("#2243: parseEstimateMinutes parses '15m' correctly", () => {
  assert.equal(parseEstimateMinutes("15m"), 15);
});

test("#2243: parseEstimateMinutes returns null for empty string", () => {
  assert.equal(parseEstimateMinutes(""), null);
});

test("#2243: parseEstimateMinutes returns null for invalid string", () => {
  assert.equal(parseEstimateMinutes("not a time"), null);
});

test("#2243: estimate scale affects soft and hard timeouts but not idle timeout", () => {
  const result = resolveUnitSupervisionTimeouts(
    "execute-task",
    {
      soft_timeout_minutes: 10,
      idle_timeout_minutes: 5,
      hard_timeout_minutes: 20,
    },
    3,
  );

  assert.deepEqual(result, {
    softTimeoutMs: 30 * 60 * 1000,
    idleTimeoutMs: 5 * 60 * 1000,
    hardTimeoutMs: 60 * 60 * 1000,
  });
});
