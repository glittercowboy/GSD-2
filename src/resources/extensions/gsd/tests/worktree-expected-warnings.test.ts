// GSD-2 — Expected worktree condition warning suppression tests.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { _isExpectedWorktreeUnlinkError } from "../auto-worktree.ts";
import { resolveGitDir } from "../worktree-manager.ts";

describe("worktree expected-condition warning suppression (#3665)", () => {
  test("known unlink races are classified as expected", () => {
    assert.equal(_isExpectedWorktreeUnlinkError("ENOENT"), true);
    assert.equal(_isExpectedWorktreeUnlinkError("EISDIR"), true);
    assert.equal(_isExpectedWorktreeUnlinkError("EACCES"), false);
  });

  test("resolveGitDir returns .git directory without reading it as a file", () => {
    const base = mkdtempSync(join(tmpdir(), "gsd-resolve-gitdir-"));
    try {
      mkdirSync(join(base, ".git"), { recursive: true });
      assert.equal(resolveGitDir(base), join(base, ".git"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("resolveGitDir resolves worktree .git file targets", () => {
    const base = mkdtempSync(join(tmpdir(), "gsd-resolve-worktree-gitdir-"));
    try {
      mkdirSync(join(base, ".gitdir"), { recursive: true });
      writeFileSync(join(base, ".git"), "gitdir: .gitdir\n");
      assert.equal(resolveGitDir(base), resolve(base, ".gitdir"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
