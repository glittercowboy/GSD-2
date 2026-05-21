// GSD-2 — stopAuto race current-unit guard regression tests.

import test from "node:test";
import assert from "node:assert/strict";

import { _resolveCurrentUnitStartedAtForTest } from "../auto/phases.ts";

test("unit started-at resolver tolerates stopAuto clearing currentUnit", () => {
  assert.equal(_resolveCurrentUnitStartedAtForTest(null), undefined);
  assert.equal(_resolveCurrentUnitStartedAtForTest(undefined), undefined);
});

test("unit started-at resolver preserves the active unit timestamp", () => {
  assert.equal(
    _resolveCurrentUnitStartedAtForTest({ startedAt: 12345 }),
    12345,
  );
});
