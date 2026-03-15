/**
 * isolation-resolver.test.ts — Tests for git isolation mode resolution.
 *
 * Covers: explicit preference override, legacy branch detection, new repo default.
 */

import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { shouldUseWorktreeIsolation } from "../auto-worktree.ts";

import { createTestContext } from "./test-helpers.ts";

const { assertEq, report } = createTestContext();

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function createTempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "isolation-resolver-test-")));
  run("git init", dir);
  run("git config user.email test@test.com", dir);
  run("git config user.name Test", dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  run("git add .", dir);
  run("git commit -m init", dir);
  run("git branch -M main", dir);
  return dir;
}

async function main(): Promise<void> {
  const tempDirs: string[] = [];

  function freshRepo(): string {
    const dir = createTempRepo();
    tempDirs.push(dir);
    return dir;
  }

  try {
    console.log("\n=== explicit preference override ===");
    {
      const repo = freshRepo();
      assertEq(shouldUseWorktreeIsolation(repo, { git: { isolation: "worktree" } }), true, "worktree preference enables worktree isolation");
      assertEq(shouldUseWorktreeIsolation(repo, { git: { isolation: "branch" } }), false, "branch preference disables worktree isolation");
    }

    console.log("\n=== legacy branch detection ===");
    {
      const repo = freshRepo();
      run("git checkout -b gsd/M001/S01", repo);
      run("git checkout main", repo);
      assertEq(shouldUseWorktreeIsolation(repo), false, "legacy slice branches default to branch isolation");
    }

    console.log("\n=== new repo default ===");
    {
      const repo = freshRepo();
      assertEq(shouldUseWorktreeIsolation(repo), true, "new repos default to worktree isolation");
    }
  } finally {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  report("isolation resolver");
}

main();
