/**
 * Ghost completion detection tests (#1989).
 *
 * Verifies that execute-task units are flagged when a commit contains only
 * .gsd/ files (no source code), preventing slices from being marked complete
 * without actual implementation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

import { getLastCommitNonGsdFiles } from "../auto-recovery.ts";

function makeGitBase(): string {
  const base = join(tmpdir(), `gsd-test-ghost-${randomUUID()}`);
  mkdirSync(base, { recursive: true });
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: base, stdio: "ignore" });
  writeFileSync(join(base, ".gitkeep"), "");
  execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: base, stdio: "ignore" });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

// ─── getLastCommitNonGsdFiles (#1989) ─────────────────────────────────────

test("getLastCommitNonGsdFiles returns empty when commit has only .gsd/ files (#1989)", () => {
  const base = makeGitBase();
  try {
    mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md"),
      "# T01 Summary\nDone.",
    );
    execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "chore: task summary only"], { cwd: base, stdio: "ignore" });

    const files = getLastCommitNonGsdFiles(base);
    assert.deepEqual(files, [], "ghost commit: no non-.gsd/ files expected");
  } finally {
    cleanup(base);
  }
});

test("getLastCommitNonGsdFiles returns source files when commit has implementation code (#1989)", () => {
  const base = makeGitBase();
  try {
    mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md"),
      "# T01 Summary\nDone.",
    );
    mkdirSync(join(base, "src"), { recursive: true });
    writeFileSync(join(base, "src", "feature.ts"), "export function feature() {}");
    execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "feat: add feature + summary"], { cwd: base, stdio: "ignore" });

    const files = getLastCommitNonGsdFiles(base);
    assert.ok(files.length > 0, "should have non-.gsd/ files");
    assert.ok(files.includes("src/feature.ts"), "should include the source file");
  } finally {
    cleanup(base);
  }
});

test("getLastCommitNonGsdFiles returns empty array for non-git directory (fail-safe) (#1989)", () => {
  const base = join(tmpdir(), `gsd-test-nogit-${randomUUID()}`);
  mkdirSync(base, { recursive: true });
  try {
    const files = getLastCommitNonGsdFiles(base);
    assert.deepEqual(files, [], "non-git dir should return empty array (fail-safe)");
  } finally {
    cleanup(base);
  }
});

test("getLastCommitNonGsdFiles excludes .gsd/ but keeps other dotfiles (#1989)", () => {
  const base = makeGitBase();
  try {
    mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
    writeFileSync(join(base, ".gsd", "milestones", "M001-ROADMAP.md"), "# Roadmap");
    writeFileSync(join(base, ".eslintrc.json"), "{}");
    execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "chore: config + gsd"], { cwd: base, stdio: "ignore" });

    const files = getLastCommitNonGsdFiles(base);
    assert.ok(files.includes(".eslintrc.json"), ".eslintrc.json is not .gsd/ — should be included");
  } finally {
    cleanup(base);
  }
});
