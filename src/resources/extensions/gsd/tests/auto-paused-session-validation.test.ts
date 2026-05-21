/**
 * auto-paused-session-validation.test.ts — Validates milestone existence
 * before restoring from paused-session.json (#1664).
 *
 * Filesystem unit coverage confirms resolveMilestonePath / resolveMilestoneFile
 * correctly detect missing and completed milestones.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { resolveMilestonePath, resolveMilestoneFile } from "../paths.ts";

// ─── Filesystem validation unit tests ───────────────────────────────────────

function makeTmpBase(): string {
  return join(tmpdir(), `gsd-paused-test-${randomUUID()}`);
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

test("resolveMilestonePath returns null for missing milestone", (t) => {
  const base = makeTmpBase();
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  t.after(() => cleanup(base));

  const result = resolveMilestonePath(base, "M999");
  assert.equal(result, null, "should return null for non-existent milestone");
});

test("resolveMilestonePath returns path for existing milestone", (t) => {
  const base = makeTmpBase();
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  t.after(() => cleanup(base));

  const result = resolveMilestonePath(base, "M001");
  assert.ok(result, "should return a path for existing milestone");
  assert.ok(result.includes("M001"), "path should contain the milestone ID");
});

test("resolveMilestoneFile returns null when no SUMMARY exists", (t) => {
  const base = makeTmpBase();
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  t.after(() => cleanup(base));

  const result = resolveMilestoneFile(base, "M001", "SUMMARY");
  assert.equal(result, null, "should return null when no SUMMARY file");
});

test("resolveMilestoneFile returns path when SUMMARY exists (completed)", (t) => {
  const base = makeTmpBase();
  const mDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(mDir, { recursive: true });
  writeFileSync(join(mDir, "M001-SUMMARY.md"), "# Summary\nDone.");
  t.after(() => cleanup(base));

  const result = resolveMilestoneFile(base, "M001", "SUMMARY");
  assert.ok(result, "should return a path when SUMMARY exists");
  assert.ok(result.includes("SUMMARY"), "path should reference SUMMARY");
});

// ─── Combined validation logic (mirrors auto.ts resume guard) ───────────────

test("stale milestone: missing dir means paused session should be discarded", (t) => {
  const base = makeTmpBase();
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  t.after(() => cleanup(base));

  const mDir = resolveMilestonePath(base, "M999");
  const summaryFile = resolveMilestoneFile(base, "M999", "SUMMARY");
  const isStale = !mDir || !!summaryFile;
  assert.ok(isStale, "milestone that doesn't exist should be detected as stale");
});

test("stale milestone: completed (has SUMMARY) means paused session should be discarded", (t) => {
  const base = makeTmpBase();
  const mDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(mDir, { recursive: true });
  writeFileSync(join(mDir, "M001-SUMMARY.md"), "# Summary\nDone.");
  t.after(() => cleanup(base));

  const dir = resolveMilestonePath(base, "M001");
  const summaryFile = resolveMilestoneFile(base, "M001", "SUMMARY");
  const isStale = !dir || !!summaryFile;
  assert.ok(isStale, "milestone with SUMMARY should be detected as stale");
});

test("valid milestone: exists and has no SUMMARY means paused session is valid", (t) => {
  const base = makeTmpBase();
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  t.after(() => cleanup(base));

  const dir = resolveMilestonePath(base, "M001");
  const summaryFile = resolveMilestoneFile(base, "M001", "SUMMARY");
  const isStale = !dir || !!summaryFile;
  assert.ok(!isStale, "active milestone should not be detected as stale");
});
