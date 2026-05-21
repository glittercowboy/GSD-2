/**
 * Tests that cleanupQuickBranch is wired to turn_end by exercising the
 * registered hook against a real temporary git repository.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { registerHooks } from "../bootstrap/register-hooks.ts";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

describe("quick task turn_end cleanup (#2668)", () => {
  it("turn_end handler runs cleanupQuickBranch and removes quick-return state", async () => {
    const repo = mkdtempSync(join(tmpdir(), "gsd-quick-cleanup-"));
    const oldCwd = process.cwd();
    try {
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test User"]);
      writeFileSync(join(repo, "README.md"), "base\n");
      git(repo, ["add", "README.md"]);
      git(repo, ["commit", "-m", "chore: initial"]);
      git(repo, ["checkout", "-b", "quick/Q1-test"]);
      writeFileSync(join(repo, "quick.txt"), "quick work\n");
      git(repo, ["add", "quick.txt"]);
      git(repo, ["commit", "-m", "test: quick work"]);

      mkdirSync(join(repo, ".gsd", "runtime"), { recursive: true });
      writeFileSync(join(repo, ".gsd", "runtime", "quick-return.json"), JSON.stringify({
        basePath: repo,
        originalBranch: "main",
        quickBranch: "quick/Q1-test",
        taskNum: 1,
        slug: "test",
        description: "test",
      }) + "\n");

      const handlers = new Map<string, Function>();
      registerHooks({ on(event: string, handler: Function) { handlers.set(event, handler); } } as any, []);
      const turnEnd = handlers.get("turn_end");
      assert.ok(turnEnd, "turn_end hook should be registered");

      process.chdir(repo);
      await turnEnd();

      assert.equal(git(repo, ["branch", "--show-current"]), "main");
      assert.throws(() => git(repo, ["rev-parse", "--verify", "quick/Q1-test"]));
      assert.equal(existsSync(join(repo, ".gsd", "runtime", "quick-return.json")), false);
    } finally {
      process.chdir(oldCwd);
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
