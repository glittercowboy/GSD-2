/**
 * Tests for fix of #3723: auto-mode resume/crash-recovery dispatches from
 * the paused milestone worktree when that worktree still exists.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ADR-016 phase 2 / B3 (#5621): the legacy `resolvePausedResumeBasePath`
// helper was retired and folded into `WorktreeLifecycle.resumeFromPausedSession`.
// The pure path-resolution function lives in `worktree-lifecycle.ts` for tests
// that exercise the path-resolution invariant without constructing a session.
import { resolvePausedResumeBasePath } from "../worktree-lifecycle.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-resume-wt-${randomUUID()}`);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* noop */ }
}

function writePausedSession(
  base: string,
  milestoneId: string,
  worktreePath: string | null,
): void {
  writeFileSync(
    join(base, ".gsd", "runtime", "paused-session.json"),
    JSON.stringify({
      milestoneId,
      originalBasePath: base,
      stepMode: false,
      worktreePath,
      pausedAt: new Date().toISOString(),
    }, null, 2),
    "utf-8",
  );
}

function makeWorktreePath(base: string, milestoneId: string): string {
  return join(base, ".gsd", "worktrees", milestoneId);
}

function setupWorktreeOnDisk(wt: string): void {
  mkdirSync(wt, { recursive: true });
  writeFileSync(
    join(wt, ".git"),
    "gitdir: /project/.git/worktrees/M001-test\n",
    "utf-8",
  );
}

test("resume base path uses paused-session worktreePath when the worktree exists", () => {
  const base = makeTmpBase();
  const wt = makeWorktreePath(base, "M001-test");
  try {
    setupWorktreeOnDisk(wt);
    assert.equal(
      resolvePausedResumeBasePath(base, wt),
      wt,
    );
  } finally {
    cleanup(base);
  }
});

test("resume base path falls back to project root when paused worktree is missing", () => {
  const base = makeTmpBase();
  const wt = makeWorktreePath(base, "M001-test");
  try {
    assert.equal(
      resolvePausedResumeBasePath(base, wt),
      base,
    );
  } finally {
    cleanup(base);
  }
});

test("read paused-session metadata round-trips worktreePath from paused-session.json", () => {
  const base = makeTmpBase();
  const wt = makeWorktreePath(base, "M001-test");
  try {
    setupWorktreeOnDisk(wt);
    writePausedSession(base, "M001-test", wt);

    const pausedPath = join(base, ".gsd", "runtime", "paused-session.json");
    const meta = JSON.parse(readFileSync(pausedPath, "utf-8"));

    assert.equal(meta.milestoneId, "M001-test");
    assert.equal(meta.worktreePath, wt);
  } finally {
    cleanup(base);
  }
});
