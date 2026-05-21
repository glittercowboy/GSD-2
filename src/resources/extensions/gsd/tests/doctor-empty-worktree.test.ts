// Project/App: GSD-2
// File Purpose: Regression tests for doctor repair of empty milestone worktrees.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGSDDoctor } from "../doctor.ts";
import { createWorktree, worktreePath } from "../worktree-manager.ts";

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function makeRepo(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-doctor-empty-worktree-"));
  runGit(["init", "-b", "main"], base);
  runGit(["config", "user.name", "Test User"], base);
  runGit(["config", "user.email", "test@example.com"], base);
  writeFileSync(join(base, "package.json"), "{\"scripts\":{}}\n", "utf-8");
  runGit(["add", "."], base);
  runGit(["commit", "-m", "chore: init"], base);
  return base;
}

test("doctor fix recreates an empty registered milestone worktree", async (t) => {
  const base = makeRepo();
  t.after(() => rmSync(base, { recursive: true, force: true }));

  createWorktree(base, "M001", { branch: "milestone/M001" });
  const wtPath = worktreePath(base, "M001");
  writeFileSync(join(wtPath, "milestone-note.txt"), "worktree branch content\n", "utf-8");
  runGit(["add", "milestone-note.txt"], wtPath);
  runGit(["commit", "-m", "test: add milestone content"], wtPath);
  for (const entry of readdirSync(wtPath)) {
    if (entry === ".git") continue;
    rmSync(join(wtPath, entry), { recursive: true, force: true });
  }
  assert.ok(existsSync(join(wtPath, ".git")), "test setup keeps registered worktree marker");
  assert.equal(existsSync(join(wtPath, "package.json")), false, "test setup removes project content");

  const report = await runGSDDoctor(base, {
    fix: true,
    fixLevel: "all",
    isolationMode: "worktree",
  });

  assert.ok(
    report.issues.some((issue) => issue.code === "worktree_empty_with_project_content"),
    "doctor reports the empty worktree",
  );
  assert.ok(
    report.fixesApplied.some((fix) => fix.includes("recreated empty worktree")),
    "doctor applies the repair",
  );
  assert.ok(existsSync(join(wtPath, "package.json")), "worktree content is restored");
  assert.ok(existsSync(join(wtPath, "milestone-note.txt")), "branch content is restored");
});
