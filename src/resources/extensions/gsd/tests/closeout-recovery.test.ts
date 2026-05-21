// Project/App: GSD-2
// File Purpose: Closeout git recovery regression tests.

import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  listUnresolvedCloseoutFailures,
  markLatestCloseoutFailureResolved,
  retryLatestCloseoutFailure,
} from "../closeout-recovery.ts";
import { closeDatabase, openDatabase, upsertTurnGitTransaction } from "../gsd-db.ts";

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function makeProject(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-closeout-recovery-"));
  run("git init", base);
  run('git config user.email "test@example.com"', base);
  run('git config user.name "Test User"', base);
  writeFileSync(join(base, "README.md"), "# Test\n", "utf-8");
  writeFileSync(join(base, ".gitignore"), ".gsd/\n", "utf-8");
  run("git add README.md .gitignore", base);
  run('git commit -m "chore: init"', base);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  openDatabase(join(base, ".gsd", "gsd.db"));
  return base;
}

function seedFailedCloseout(basePath: string, unitId = "M001/S01/T01"): void {
  upsertTurnGitTransaction({
    traceId: `trace-${unitId}`,
    turnId: `turn-${unitId}`,
    unitType: "execute-task",
    unitId,
    stage: "publish",
    action: "commit",
    push: false,
    status: "failed",
    error: "blocked by test hook",
    metadata: { basePath },
    updatedAt: new Date().toISOString(),
  });
}

test("closeout recovery lists unresolved failures and records manual resolution", () => {
  const base = makeProject();
  try {
    seedFailedCloseout(base);

    assert.equal(listUnresolvedCloseoutFailures().length, 1);
    const resolved = markLatestCloseoutFailureResolved(base);

    assert.equal(resolved.status, "ok");
    assert.equal(listUnresolvedCloseoutFailures().length, 0);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("closeout recovery retry commits dirty worktree and clears unresolved failure", () => {
  const base = makeProject();
  try {
    seedFailedCloseout(base, "M001/S01/T02");
    writeFileSync(join(base, "feature.txt"), "retry me\n", "utf-8");

    const result = retryLatestCloseoutFailure(base);

    assert.equal(result.status, "ok");
    assert.equal(run("git status --porcelain", base), "");
    assert.match(run("git log -1 --pretty=%B", base), /GSD-Unit: M001\/S01\/T02/);
    assert.equal(listUnresolvedCloseoutFailures().length, 0);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("closeout manual resolve refuses a dirty worktree", () => {
  const base = makeProject();
  try {
    seedFailedCloseout(base, "M001/S01/T03");
    writeFileSync(join(base, "manual.txt"), "still dirty\n", "utf-8");

    const blocked = markLatestCloseoutFailureResolved(base);

    assert.equal(blocked.status, "blocked");
    assert.match(blocked.status === "blocked" ? blocked.message : "", /uncommitted changes/);
    assert.equal(listUnresolvedCloseoutFailures().length, 1);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});
