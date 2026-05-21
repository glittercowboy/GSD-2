import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { ensureDbOpen } from "../bootstrap/dynamic-tools.ts";
import {
  closeDatabase,
  getAllMilestones,
  insertMilestone,
  insertSlice,
  insertTask,
  getSliceTasks,
} from "../gsd-db.ts";
import {
  checkMarkdownHierarchyAgainstDb,
  countMarkdownHierarchy,
} from "../migration-auto-check.ts";
import { writeGSDDirectory } from "../migrate/writer.ts";
import type { GSDProject } from "../migrate/types.ts";

function makeBase(): string {
  return mkdtempSync(join(tmpdir(), "gsd-migration-auto-check-"));
}

function cleanup(base: string): void {
  closeDatabase();
  rmSync(base, { recursive: true, force: true });
}

function projectFixture(): GSDProject {
  return {
    projectContent: "# Legacy Project\n",
    decisionsContent: "",
    requirements: [],
    milestones: [
      {
        id: "M001",
        title: "Legacy Milestone",
        vision: "Carry forward previous work",
        successCriteria: ["Existing task is visible"],
        research: null,
        boundaryMap: [],
        slices: [
          {
            id: "S01",
            title: "Legacy Slice",
            risk: "medium",
            depends: [],
            done: false,
            demo: "Legacy slice demo",
            goal: "Legacy slice demo",
            research: null,
            summary: null,
            tasks: [
              {
                id: "T01",
                title: "Legacy Task",
                description: "Task carried from markdown",
                done: false,
                estimate: "",
                files: ["src/index.ts"],
                mustHaves: [],
                summary: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

test("migration auto-check preserves empty DB and reports explicit recovery", async () => {
  const base = makeBase();
  try {
    await writeGSDDirectory(projectFixture(), base);
    assert.deepEqual(countMarkdownHierarchy(base), { milestones: 1, slices: 1, tasks: 1 });

    assert.equal(await ensureDbOpen(base), true);
    assert.equal(getAllMilestones().length, 0, "fresh authoritative DB starts empty");

    const result = await checkMarkdownHierarchyAgainstDb(base);
    assert.equal(result.action, "recovery-required");
    assert.equal(result.reason, "db-empty");
    assert.deepEqual(result.afterDb, { milestones: 0, slices: 0, tasks: 0 });
    assert.equal(result.recoveryCommand, "gsd recover");
    assert.match(result.message ?? "", /will not import markdown automatically/);
    assert.equal(getAllMilestones().length, 0);
    assert.equal(getSliceTasks("M001", "S01").length, 0);
  } finally {
    cleanup(base);
  }
});

test("migration auto-check preserves DB on hierarchy count mismatch", async () => {
  const base = makeBase();
  try {
    await writeGSDDirectory(projectFixture(), base);
    assert.equal(await ensureDbOpen(base), true);
    insertMilestone({ id: "M001", title: "Legacy Milestone", status: "active" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Legacy Slice", status: "pending", risk: "medium", depends: [], demo: "Legacy slice demo", sequence: 1 });
    assert.equal(getSliceTasks("M001", "S01").length, 0, "test fixture simulates stale DB task count");

    const result = await checkMarkdownHierarchyAgainstDb(base);
    assert.equal(result.action, "recovery-required");
    assert.equal(result.reason, "count-mismatch");
    assert.deepEqual(result.beforeDb, { milestones: 1, slices: 1, tasks: 0 });
    assert.deepEqual(result.afterDb, { milestones: 1, slices: 1, tasks: 0 });
    assert.equal(result.recoveryCommand, "gsd recover");
    assert.equal(getSliceTasks("M001", "S01").length, 0);
  } finally {
    cleanup(base);
  }
});

test("migration auto-check leaves matching DB hierarchy alone", async () => {
  const base = makeBase();
  try {
    await writeGSDDirectory(projectFixture(), base);
    assert.equal(await ensureDbOpen(base), true);
    insertMilestone({ id: "M001", title: "Legacy Milestone", status: "active" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Legacy Slice", status: "pending", risk: "medium", depends: [], demo: "Legacy slice demo", sequence: 1 });
    insertTask({ id: "T01", sliceId: "S01", milestoneId: "M001", title: "Legacy Task", status: "pending" });

    const result = await checkMarkdownHierarchyAgainstDb(base);
    assert.equal(result.action, "none");
    assert.equal(result.reason, "in-sync");
    assert.deepEqual(result.markdown, { milestones: 1, slices: 1, tasks: 1 });
    assert.deepEqual(result.afterDb, { milestones: 1, slices: 1, tasks: 1 });
  } finally {
    cleanup(base);
  }
});
