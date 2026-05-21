/**
 * Regression test for #3697 — set slice sequence on insert.
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { handlePlanMilestone } from "../tools/plan-milestone.ts";
import { handleReassessRoadmap } from "../tools/reassess-roadmap.ts";
import { migrateHierarchyToDb } from "../md-importer.ts";
import {
  closeDatabase,
  getMilestoneSlices,
  insertMilestone,
  insertSlice,
  openDatabase,
} from "../gsd-db.ts";

let tempBase: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempBase) rmSync(tempBase, { recursive: true, force: true });
  tempBase = null;
});

function makeBase(name: string): string {
  tempBase = mkdtempSync(join(tmpdir(), name));
  mkdirSync(join(tempBase, ".gsd", "milestones"), { recursive: true });
  openDatabase(join(tempBase, ".gsd", "gsd.db"));
  return tempBase;
}

function slice(sliceId: string, title: string) {
  return {
    sliceId,
    title,
    risk: "low",
    depends: [],
    demo: `${title} demo`,
    goal: `${title} goal`,
    successCriteria: `${title} success`,
    proofLevel: "unit",
    integrationClosure: "covered",
    observabilityImpact: "none",
  };
}

describe("slice sequence on insert (#3697)", () => {
  test("plan milestone persists slices in agent-provided order", async () => {
    const base = makeBase("gsd-sequence-plan-");

    const result = await handlePlanMilestone({
      milestoneId: "M001",
      title: "Sequence",
      vision: "Preserve slice order",
      slices: [slice("S01", "First"), slice("S02", "Second"), slice("S03", "Third")],
    }, base);

    assert.ok(!("error" in result), JSON.stringify(result));
    assert.deepEqual(
      getMilestoneSlices("M001").map((row) => [row.id, row.sequence]),
      [["S01", 1], ["S02", 2], ["S03", 3]],
    );
  });

  test("reassess roadmap appends new slices after existing slices", async () => {
    const base = makeBase("gsd-sequence-reassess-");
    insertMilestone({ id: "M001", title: "Sequence", status: "active", depends_on: [] });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Done", status: "complete", risk: "low", depends: [], demo: "", sequence: 1 });
    insertSlice({ id: "S02", milestoneId: "M001", title: "Existing", status: "pending", risk: "low", depends: [], demo: "", sequence: 2 });

    const result = await handleReassessRoadmap({
      milestoneId: "M001",
      completedSliceId: "S01",
      verdict: "pass",
      assessment: "Add follow-up slices.",
      sliceChanges: {
        modified: [],
        added: [
          { sliceId: "S03", title: "Added 1", risk: "low", depends: [], demo: "" },
          { sliceId: "S04", title: "Added 2", risk: "low", depends: [], demo: "" },
        ],
        removed: [],
      },
    }, base);

    assert.ok(!("error" in result), JSON.stringify(result));
    assert.deepEqual(
      getMilestoneSlices("M001").map((row) => [row.id, row.sequence]),
      [["S01", 1], ["S02", 2], ["S03", 3], ["S04", 4]],
    );
  });

  test("markdown importer preserves roadmap order in sequence values", () => {
    const base = makeBase("gsd-sequence-import-");
    const milestoneDir = join(base, ".gsd", "milestones", "M001");
    mkdirSync(milestoneDir, { recursive: true });
    writeFileSync(
      join(milestoneDir, "M001-ROADMAP.md"),
      [
        "# M001: Imported",
        "",
        "## Slices",
        "- [ ] **S01: First** `risk:low`",
        "  Demo: first.",
        "- [ ] **S02: Second** `risk:low`",
        "  Demo: second.",
      ].join("\n"),
      "utf-8",
    );

    const result = migrateHierarchyToDb(base);

    assert.equal(result.slices, 2);
    assert.deepEqual(
      getMilestoneSlices("M001").map((row) => [row.id, row.sequence]),
      [["S01", 1], ["S02", 2]],
    );
  });
});
