import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveIsolationNoneBranchCheckout } from "../auto-start.ts";

describe("isolation:none stale branch guard (#3675)", () => {
  test("returns integration branch for stale milestone branch in isolation:none", () => {
    assert.equal(
      resolveIsolationNoneBranchCheckout("milestone/M001", "main", "none", true),
      "main",
    );
  });

  test("does nothing outside milestone branches, repos, or isolation:none", () => {
    assert.equal(resolveIsolationNoneBranchCheckout("feature", "main", "none", true), null);
    assert.equal(resolveIsolationNoneBranchCheckout("milestone/M001", "main", "worktree", true), null);
    assert.equal(resolveIsolationNoneBranchCheckout("milestone/M001", "main", "none", false), null);
  });
});
