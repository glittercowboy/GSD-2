// GSD2 — Verify autoStartTime is carried through dashboard state

import test from "node:test";
import assert from "node:assert/strict";

import { getAutoDashboardData } from "../auto.ts";
import { autoSession } from "../auto-runtime-state.ts";

test.afterEach(() => {
  autoSession.reset();
});

test("getAutoDashboardData exposes the active autoStartTime (#3585)", () => {
  const start = Date.now() - 5_000;
  autoSession.active = true;
  autoSession.autoStartTime = start;

  const data = getAutoDashboardData();

  assert.equal(data.startTime, start);
  assert.ok(data.elapsed >= 0);
});

test("getAutoDashboardData suppresses elapsed time when autoStartTime is zero (#3585)", () => {
  autoSession.active = true;
  autoSession.autoStartTime = 0;

  const data = getAutoDashboardData();

  assert.equal(data.startTime, 0);
  assert.equal(data.elapsed, 0);
});
