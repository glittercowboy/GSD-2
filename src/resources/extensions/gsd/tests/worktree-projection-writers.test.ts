// Project/App: GSD-2
// File Purpose: Regression tests for workflow artifact writers in milestone worktrees.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  closeDatabase,
  insertAssessment,
  insertMilestone,
  insertSlice,
  insertTask,
  openDatabase,
  updateSliceStatus,
} from "../gsd-db.ts";
import { clearParseCache } from "../files.ts";
import { clearPathCache } from "../paths.ts";
import { invalidateStateCache } from "../state.ts";
import { handleCompleteTask } from "../tools/complete-task.ts";
import { handleCompleteSlice } from "../tools/complete-slice.ts";
import { handleCompleteMilestone } from "../tools/complete-milestone.ts";
import { handleValidateMilestone } from "../tools/validate-milestone.ts";

const MID = "M001";
const SID = "S01";

interface WorktreeFixture {
  projectRoot: string;
  worktreeRoot: string;
}

function makeFixture(t: test.TestContext): WorktreeFixture {
  const projectRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "gsd-worktree-projection-")));
  const worktreeRoot = join(projectRoot, ".gsd", "worktrees", MID);

  mkdirSync(join(projectRoot, ".gsd", "milestones", MID, "slices", SID, "tasks"), { recursive: true });
  mkdirSync(join(worktreeRoot, ".gsd", "milestones", MID, "slices", SID, "tasks"), { recursive: true });
  writeFileSync(join(worktreeRoot, ".git"), "gitdir: ../../../.git/worktrees/M001\n", "utf8");

  assert.equal(openDatabase(join(projectRoot, ".gsd", "gsd.db")), true);

  t.after(() => {
    invalidateStateCache();
    clearPathCache();
    clearParseCache();
    closeDatabase();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  return { projectRoot, worktreeRoot };
}

function seedMilestoneAndSlice(): void {
  insertMilestone({ id: MID, title: "Milestone" });
  insertSlice({ id: SID, milestoneId: MID, title: "Slice" });
}

function completeTaskParams(taskId = "T01") {
  return {
    taskId,
    sliceId: SID,
    milestoneId: MID,
    oneLiner: "Finished task",
    narrative: "Implemented the task.",
    verification: "node --test passed.",
    deviations: "None.",
    knownIssues: "None.",
    keyFiles: ["app.js"],
    keyDecisions: [],
    blockerDiscovered: false,
    verificationEvidence: [
      {
        command: "node --test",
        exitCode: 0,
        verdict: "pass",
        durationMs: 10,
      },
    ],
  };
}

function completeSliceParams() {
  return {
    sliceId: SID,
    milestoneId: MID,
    sliceTitle: "Slice",
    oneLiner: "Finished slice",
    narrative: "Completed all tasks for the slice.",
    verification: "All task verification passed.",
    deviations: "None.",
    knownLimitations: "None.",
    followUps: "None.",
    keyFiles: ["app.js"],
    keyDecisions: [],
    patternsEstablished: [],
    observabilitySurfaces: [],
    provides: [],
    requirementsSurfaced: [],
    drillDownPaths: [],
    affects: [],
    requirementsAdvanced: [],
    requirementsValidated: [],
    requirementsInvalidated: [],
    filesModified: [],
    requires: [],
    uatContent: "Run the app and verify the slice behavior.",
  };
}

function validateMilestoneParams() {
  return {
    milestoneId: MID,
    verdict: "pass" as const,
    remediationRound: 0,
    successCriteriaChecklist: "- Passed",
    sliceDeliveryAudit: "- Slices delivered",
    crossSliceIntegration: "- Integrated",
    requirementCoverage: "- Covered",
    verdictRationale: "Milestone meets the acceptance criteria.",
  };
}

test("complete-task writes SUMMARY under the active worktree projection", async (t) => {
  const { projectRoot, worktreeRoot } = makeFixture(t);
  seedMilestoneAndSlice();
  insertTask({ id: "T02", sliceId: SID, milestoneId: MID, status: "pending", title: "Other task" });

  const result = await handleCompleteTask(completeTaskParams(), worktreeRoot);

  assert.ok(!("error" in result), "complete-task should succeed");
  const expected = join(worktreeRoot, ".gsd", "milestones", MID, "slices", SID, "tasks", "T01-SUMMARY.md");
  const projectProjection = join(projectRoot, ".gsd", "milestones", MID, "slices", SID, "tasks", "T01-SUMMARY.md");
  assert.equal(result.summaryPath, expected);
  assert.equal(existsSync(expected), true);
  assert.equal(existsSync(projectProjection), false);
});

test("complete-slice writes SUMMARY and UAT under the active worktree projection", async (t) => {
  const { projectRoot, worktreeRoot } = makeFixture(t);
  seedMilestoneAndSlice();
  insertTask({ id: "T01", sliceId: SID, milestoneId: MID, status: "complete", title: "Task" });

  const result = await handleCompleteSlice(completeSliceParams(), worktreeRoot);

  assert.ok(!("error" in result), "complete-slice should succeed");
  const expectedSummary = join(worktreeRoot, ".gsd", "milestones", MID, "slices", SID, "S01-SUMMARY.md");
  const expectedUat = join(worktreeRoot, ".gsd", "milestones", MID, "slices", SID, "S01-UAT.md");
  const projectSummary = join(projectRoot, ".gsd", "milestones", MID, "slices", SID, "S01-SUMMARY.md");
  const projectUat = join(projectRoot, ".gsd", "milestones", MID, "slices", SID, "S01-UAT.md");
  assert.equal(result.summaryPath, expectedSummary);
  assert.equal(result.uatPath, expectedUat);
  assert.equal(existsSync(expectedSummary), true);
  assert.equal(existsSync(expectedUat), true);
  assert.equal(existsSync(projectSummary), false);
  assert.equal(existsSync(projectUat), false);
});

test("validate-milestone invoked from the project root writes VALIDATION under the live worktree projection", async (t) => {
  const { projectRoot, worktreeRoot } = makeFixture(t);
  seedMilestoneAndSlice();

  const result = await handleValidateMilestone(validateMilestoneParams(), projectRoot, {
    uokGatesEnabled: false,
  });

  assert.ok(!("error" in result), "validate-milestone should succeed");
  const expected = join(worktreeRoot, ".gsd", "milestones", MID, "M001-VALIDATION.md");
  const projectProjection = join(projectRoot, ".gsd", "milestones", MID, "M001-VALIDATION.md");
  assert.equal(result.validationPath, expected);
  assert.equal(existsSync(expected), true);
  assert.equal(existsSync(projectProjection), false);
});

test("complete-milestone writes SUMMARY under the active worktree projection", async (t) => {
  const { projectRoot, worktreeRoot } = makeFixture(t);
  seedMilestoneAndSlice();
  insertTask({ id: "T01", sliceId: SID, milestoneId: MID, status: "complete", title: "Task" });
  updateSliceStatus(MID, SID, "complete", new Date().toISOString());
  insertAssessment({
    path: join(worktreeRoot, ".gsd", "milestones", MID, "M001-VALIDATION.md"),
    milestoneId: MID,
    sliceId: null,
    taskId: null,
    status: "pass",
    scope: "milestone-validation",
    fullContent: "---\nverdict: pass\nremediation_round: 0\n---\n\n# Validation\n",
  });

  const result = await handleCompleteMilestone({
    milestoneId: MID,
    title: "Milestone",
    oneLiner: "Finished milestone",
    narrative: "Completed the milestone.",
    verificationPassed: true,
  }, worktreeRoot);

  assert.ok(!("error" in result), "complete-milestone should succeed");
  const expected = join(worktreeRoot, ".gsd", "milestones", MID, "M001-SUMMARY.md");
  const projectProjection = join(projectRoot, ".gsd", "milestones", MID, "M001-SUMMARY.md");
  assert.equal(result.summaryPath, expected);
  assert.equal(existsSync(expected), true);
  assert.equal(existsSync(projectProjection), false);
});
