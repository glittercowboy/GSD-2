/**
 * Regression test for DB-authoritative rogue detection.
 *
 * A SUMMARY.md on disk is a projection/diagnostic. Runtime post-unit checks
 * must not use it to mark the DB slice complete; explicit import/recovery
 * commands own markdown-to-DB behavior.
 */

import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { detectRogueFileWrites } from "../auto-post-unit.ts";
import {
  closeDatabase,
  getSlice,
  insertMilestone,
  insertSlice,
  isDbAvailable,
  openDatabase,
} from "../gsd-db.ts";

afterEach(() => {
  if (isDbAvailable()) closeDatabase();
});

describe("DB-authoritative slice rogue detection", () => {
  test("complete-slice SUMMARY.md is reported as rogue without marking DB complete", (t) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-rogue-slice-")));
    t.after(() => rmSync(base, { recursive: true, force: true }));

    mkdirSync(join(base, ".gsd"), { recursive: true });
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Milestone", status: "active" });
    insertSlice({ milestoneId: "M001", id: "S01", title: "Slice", status: "pending", sequence: 1 });

    const summaryPath = join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md");
    mkdirSync(dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, "# Summary\n", "utf-8");

    const rogues = detectRogueFileWrites("complete-slice", "M001/S01", base);

    assert.deepEqual(rogues, [{ path: summaryPath, unitType: "complete-slice", unitId: "M001/S01" }]);
    assert.equal(getSlice("M001", "S01")?.status, "pending");
  });
});
