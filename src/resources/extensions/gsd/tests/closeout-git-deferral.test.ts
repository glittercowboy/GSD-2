// Project/App: GSD-2
// File Purpose: Tests closeout git action deferral policy for auto-mode units.

import test from "node:test";
import assert from "node:assert/strict";

import { shouldDeferCloseoutGitAction } from "../auto-post-unit.ts";

test("execute-task defers closeout git action until verification passes", () => {
  assert.equal(shouldDeferCloseoutGitAction("execute-task"), true);
});

test("non execute-task units keep pre-verification closeout git action", () => {
  assert.equal(shouldDeferCloseoutGitAction("plan-slice"), false);
  assert.equal(shouldDeferCloseoutGitAction("complete-slice"), false);
});
