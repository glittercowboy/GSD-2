// GSD-2 — Auto-worktree main branch preference regression tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { _resolveAutoWorktreeStartPoint } from "../auto-worktree.ts";

test("auto-worktree start point prefers milestone integration branch", () => {
  const startPoint = _resolveAutoWorktreeStartPoint(
    "release/integration",
    "dev",
    () => true,
  );

  assert.equal(startPoint, "release/integration");
});

test("auto-worktree start point uses git.main_branch only when it exists", () => {
  assert.equal(
    _resolveAutoWorktreeStartPoint(null, "dev", (branch) => branch === "dev"),
    "dev",
  );
  assert.equal(
    _resolveAutoWorktreeStartPoint(null, "stale", () => false),
    undefined,
  );
});
