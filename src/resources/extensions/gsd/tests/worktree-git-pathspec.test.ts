import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { _gitPathspecForWorktreePath } from "../auto-worktree.ts";

function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

describe("worktree git pathspec", () => {
  test("skips external GSD bookkeeping directories outside the git work-tree", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "gsd-pathspec-")));
    const repo = join(root, "project");
    const externalGsd = join(root, ".gsd", "projects", "abc123");

    try {
      mkdirSync(repo, { recursive: true });
      mkdirSync(join(externalGsd, "milestones", "M002-wa00fm"), { recursive: true });
      mkdirSync(join(externalGsd, "runtime", "units"), { recursive: true });
      run("git", ["init"], repo);
      writeFileSync(join(repo, "README.md"), "# test\n");

      assert.equal(
        _gitPathspecForWorktreePath(repo, join(externalGsd, "milestones", "M002-wa00fm")),
        null,
      );
      assert.equal(
        _gitPathspecForWorktreePath(repo, join(externalGsd, "runtime", "units")),
        null,
      );
    } finally {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    }
  });
});
