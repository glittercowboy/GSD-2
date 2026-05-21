/**
 * Regression test for DB-authoritative syncWorktreeStateBack behavior.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { syncWorktreeStateBack } from "../auto-worktree.ts";

describe("syncWorktreeStateBack does not copy worktree milestone projections", () => {
  it("copies root diagnostics but leaves milestone markdown directories behind", () => {
    const root = mkdtempSync(join(tmpdir(), "gsd-sync-back-"));
    const main = join(root, "main");
    const worktree = join(root, "worktree");
    try {
      mkdirSync(join(main, ".gsd", "milestones"), { recursive: true });
      mkdirSync(join(worktree, ".gsd", "milestones", "M001"), { recursive: true });
      writeFileSync(join(worktree, ".gsd", "metrics.json"), "{}\n", "utf-8");
      writeFileSync(
        join(worktree, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
        "# M001: Worktree-only projection\n",
        "utf-8",
      );

      const result = syncWorktreeStateBack(main, worktree, "M001");

      assert.deepEqual(result.synced, ["metrics.json"]);
      assert.equal(existsSync(join(main, ".gsd", "metrics.json")), true);
      assert.equal(
        existsSync(join(main, ".gsd", "milestones", "M001", "M001-ROADMAP.md")),
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
