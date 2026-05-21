import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DISPATCH_RULES } from "../auto-dispatch.ts";
import {
  closeDatabase,
  getLatestAssessmentByScope,
  insertMilestone,
  insertSlice,
  openDatabase,
} from "../gsd-db.ts";

test("skipped validation dispatch persists the validation file and DB assessment together", async () => {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-skip-validation-"));
  const milestoneDir = join(basePath, ".gsd", "milestones", "M001");
  const sliceDir = join(milestoneDir, "slices", "S01");
  const rule = DISPATCH_RULES.find((r) => r.name === "validating-milestone → validate-milestone");
  assert.ok(rule, "validate-milestone rule is registered");

  try {
    mkdirSync(sliceDir, { recursive: true });
    writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# S01 Summary\n", "utf-8");
    openDatabase(join(basePath, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Validation", status: "active", depends_on: [] });
    insertSlice({
      id: "S01",
      milestoneId: "M001",
      title: "Done slice",
      status: "complete",
      risk: "low",
      depends: [],
      demo: "",
      sequence: 1,
    });

    const action = await rule.match({
      state: { phase: "validating-milestone" },
      mid: "M001",
      midTitle: "Validation",
      basePath,
      prefs: { phases: { skip_milestone_validation: true } },
    } as any);

    assert.deepEqual(action, { action: "skip" });
    assert.equal(existsSync(join(milestoneDir, "M001-VALIDATION.md")), true);
    assert.equal(
      getLatestAssessmentByScope("M001", "milestone-validation")?.status,
      "pass",
    );
  } finally {
    closeDatabase();
    rmSync(basePath, { recursive: true, force: true });
  }
});
