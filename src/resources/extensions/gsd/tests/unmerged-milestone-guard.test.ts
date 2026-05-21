// Project/App: GSD-2
// File Purpose: Regression tests for blocking completed-but-unmerged milestone branches.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  closeDatabase,
  insertMilestone,
  openDatabase,
} from "../gsd-db.ts";
import {
  findUnmergedCompletedMilestones,
  formatUnmergedMilestoneBlockMessage,
  isUnmergedMilestoneAllowedCommand,
} from "../unmerged-milestone-guard.ts";
import { cleanup, git, makeTempRepo } from "./test-utils.ts";

function seedMilestone(base: string, id: string, status = "complete"): void {
  mkdirSync(join(base, ".gsd"), { recursive: true });
  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id, title: `${id}: Test milestone`, status });
}

function commitBranchFile(base: string, branch: string, filePath: string, content: string): void {
  git(base, "checkout", "-b", branch);
  const absolutePath = join(base, filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  git(base, "add", filePath);
  git(base, "commit", "-m", `feat: update ${filePath}`);
  git(base, "checkout", "main");
}

test("findUnmergedCompletedMilestones blocks completed milestone branch product diffs", async () => {
  const base = makeTempRepo("gsd-unmerged-guard-");
  try {
    seedMilestone(base, "M008");
    commitBranchFile(base, "milestone/M008", "index.html", "<h1>M008</h1>\n");

    const blockers = await findUnmergedCompletedMilestones(base);

    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].milestoneId, "M008");
    assert.equal(blockers[0].branch, "milestone/M008");
    assert.equal(blockers[0].integrationBranch, "main");
    assert.deepEqual(blockers[0].files, ["index.html"]);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("findUnmergedCompletedMilestones ignores projection-only branch diffs", async () => {
  const base = makeTempRepo("gsd-unmerged-guard-");
  try {
    seedMilestone(base, "M009");
    commitBranchFile(
      base,
      "milestone/M009",
      ".gsd/milestones/M009/M009-SUMMARY.md",
      "# M009 complete\n",
    );

    const blockers = await findUnmergedCompletedMilestones(base);

    assert.equal(blockers.length, 0);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("formatUnmergedMilestoneBlockMessage includes files, branch, and dirty overlap recovery", async () => {
  const base = makeTempRepo("gsd-unmerged-guard-");
  try {
    seedMilestone(base, "M010");
    commitBranchFile(base, "milestone/M010", "index.html", "<h1>M010</h1>\n");
    writeFileSync(join(base, "index.html"), "<h1>dirty root</h1>\n");

    const [blocker] = await findUnmergedCompletedMilestones(base);
    assert.ok(blocker);

    const message = formatUnmergedMilestoneBlockMessage(blocker, "next");

    assert.match(message, /\/gsd next cannot start new workflow work/);
    assert.match(message, /M010 is complete but not merged/);
    assert.match(message, /Branch: milestone\/M010/);
    assert.match(message, /Target: main/);
    assert.match(message, /index\.html/);
    assert.match(message, /Project-root dirty files overlap/);
    assert.match(message, /Commit, stash, or discard/);
    assert.match(message, /\/gsd dispatch complete-milestone M010/);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("isUnmergedMilestoneAllowedCommand permits inspection and explicit recovery commands", () => {
  assert.equal(isUnmergedMilestoneAllowedCommand(""), false);
  assert.equal(isUnmergedMilestoneAllowedCommand("auto"), false);
  assert.equal(isUnmergedMilestoneAllowedCommand("next"), false);
  assert.equal(isUnmergedMilestoneAllowedCommand("status"), true);
  assert.equal(isUnmergedMilestoneAllowedCommand("worktree list"), true);
  assert.equal(isUnmergedMilestoneAllowedCommand("dispatch complete"), true);
  assert.equal(isUnmergedMilestoneAllowedCommand("dispatch complete M008"), true);
  assert.equal(isUnmergedMilestoneAllowedCommand("dispatch complete-milestone"), true);
  assert.equal(isUnmergedMilestoneAllowedCommand("dispatch complete-milestone M008"), true);
});
