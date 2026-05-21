/**
 * completed-units-metrics-sync.test.ts — Regression tests for #2313.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncStateToProjectRoot } from "../auto-worktree.ts";

test("#2313: syncStateToProjectRoot copies metrics and completed-units to the project root", () => {
  const root = mkdtempSync(join(tmpdir(), "gsd-sync-metrics-"));
  const projectRoot = join(root, "project");
  const worktree = join(root, "worktree");
  mkdirSync(join(projectRoot, ".gsd"), { recursive: true });
  mkdirSync(join(worktree, ".gsd"), { recursive: true });
  writeFileSync(join(worktree, ".gsd", "metrics.json"), JSON.stringify({ tokens: 42 }));
  writeFileSync(join(worktree, ".gsd", "completed-units.json"), JSON.stringify([{ id: "T01" }]));

  try {
    syncStateToProjectRoot(worktree, projectRoot, "M001");

    assert.deepEqual(
      JSON.parse(readFileSync(join(projectRoot, ".gsd", "metrics.json"), "utf-8")),
      { tokens: 42 },
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(projectRoot, ".gsd", "completed-units.json"), "utf-8")),
      [{ id: "T01" }],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#2313: functional — completed-units archive creates milestone-specific file", () => {
  const tmpBase = mkdtempSync(join(tmpdir(), "gsd-completed-units-"));
  const gsdDir = join(tmpBase, ".gsd");
  mkdirSync(gsdDir, { recursive: true });

  try {
    const existing = [
      { type: "task", id: "T01" },
      { type: "slice", id: "S01" },
    ];
    const completedKeysPath = join(gsdDir, "completed-units.json");
    writeFileSync(completedKeysPath, JSON.stringify(existing, null, 2));

    const milestoneId = "M001";
    const archivePath = join(gsdDir, `completed-units-${milestoneId}.json`);
    cpSync(completedKeysPath, archivePath);
    writeFileSync(completedKeysPath, JSON.stringify([], null, 2));

    assert.ok(existsSync(archivePath), "archive file should exist");
    assert.deepEqual(JSON.parse(readFileSync(archivePath, "utf-8")), existing);
    assert.deepEqual(JSON.parse(readFileSync(completedKeysPath, "utf-8")), []);
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
  }
});
