/**
 * Unit tests for diff-context.ts — diff-aware context module.
 * Tests git-based file discovery and relevance ranking.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

import {
  getRecentlyChangedFiles,
  getChangedFilesWithContext,
  rankFilesByRelevance,
} from "../diff-context.js";

// ─── getRecentlyChangedFiles ────────────────────────────────────────────────

describe("diff-context: getRecentlyChangedFiles", () => {
  it("returns an array of file paths in the current git repo", async () => {
    // Use the project root — guaranteed to be a git repo
    const cwd = process.cwd();
    const files = await getRecentlyChangedFiles(cwd);

    assert.ok(Array.isArray(files), "should return an array");
    // The result may be empty if the repo is totally clean with no recent
    // commits, but the function should not throw.
  });

  it("respects maxFiles option", async () => {
    const cwd = process.cwd();
    const files = await getRecentlyChangedFiles(cwd, { maxFiles: 3 });

    assert.ok(files.length <= 3, "should not exceed maxFiles");
  });

  it("returns empty array for non-git directory", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "diff-ctx-test-"));
    const files = await getRecentlyChangedFiles(tmp);

    assert.deepStrictEqual(files, [], "should return empty array for non-git dir");
  });

  it("returns deduplicated paths", async () => {
    const cwd = process.cwd();
    const files = await getRecentlyChangedFiles(cwd, { maxFiles: 100 });
    const unique = new Set(files);

    assert.equal(files.length, unique.size, "should have no duplicates");
  });
});

// ─── getChangedFilesWithContext ─────────────────────────────────────────────

describe("diff-context: getChangedFilesWithContext", () => {
  it("returns array of ChangedFileInfo objects", async () => {
    const cwd = process.cwd();
    const infos = await getChangedFilesWithContext(cwd);

    assert.ok(Array.isArray(infos), "should return an array");

    for (const info of infos) {
      assert.ok(typeof info.path === "string", "path should be a string");
      assert.ok(
        ["modified", "added", "deleted", "staged"].includes(info.changeType),
        `changeType should be valid, got: ${info.changeType}`,
      );
      if (info.linesChanged !== undefined) {
        assert.ok(typeof info.linesChanged === "number", "linesChanged should be a number");
      }
    }
  });

  it("returns empty array for non-git directory", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "diff-ctx-test2-"));
    const infos = await getChangedFilesWithContext(tmp);

    assert.deepStrictEqual(infos, [], "should return empty array for non-git dir");
  });
});

// ─── rankFilesByRelevance ───────────────────────────────────────────────────

describe("diff-context: rankFilesByRelevance", () => {
  it("places changed files before unchanged files", () => {
    const allFiles = ["a.ts", "b.ts", "c.ts", "d.ts"];
    const changed = ["c.ts", "a.ts"];

    const ranked = rankFilesByRelevance(allFiles, changed);

    // Changed files come first, sorted by changedFiles priority (c before a)
    assert.equal(ranked[0], "c.ts");
    assert.equal(ranked[1], "a.ts");
    // Unchanged files follow in original order
    assert.equal(ranked[2], "b.ts");
    assert.equal(ranked[3], "d.ts");
  });

  it("preserves order of changed files based on changedFiles priority", () => {
    const allFiles = ["x.ts", "y.ts", "z.ts", "w.ts"];
    const changed = ["z.ts", "x.ts"]; // z has higher priority (index 0)

    const ranked = rankFilesByRelevance(allFiles, changed);

    assert.equal(ranked[0], "z.ts", "z.ts should be first (higher priority in changedFiles)");
    assert.equal(ranked[1], "x.ts", "x.ts should be second");
  });

  it("returns unchanged files in original order when no changed files match", () => {
    const allFiles = ["a.ts", "b.ts", "c.ts"];
    const changed = ["x.ts", "y.ts"]; // none match

    const ranked = rankFilesByRelevance(allFiles, changed);

    assert.deepStrictEqual(ranked, ["a.ts", "b.ts", "c.ts"]);
  });

  it("handles empty inputs gracefully", () => {
    assert.deepStrictEqual(rankFilesByRelevance([], []), []);
    assert.deepStrictEqual(rankFilesByRelevance(["a.ts"], []), ["a.ts"]);
    assert.deepStrictEqual(rankFilesByRelevance([], ["a.ts"]), []);
  });

  it("handles all files being changed", () => {
    const allFiles = ["a.ts", "b.ts"];
    const changed = ["b.ts", "a.ts"];

    const ranked = rankFilesByRelevance(allFiles, changed);

    // Both are changed, so sorted by changedFiles order: b first, then a
    assert.equal(ranked[0], "b.ts");
    assert.equal(ranked[1], "a.ts");
    assert.equal(ranked.length, 2);
  });
});
