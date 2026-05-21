/**
 * Verify that state derivation treats DB slice rows as authoritative over
 * stale markdown projections.
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { deriveState, invalidateStateCache } from "../state.ts";
import { closeDatabase, insertMilestone, insertSlice, openDatabase } from "../gsd-db.ts";

let tempBase: string | null = null;

afterEach(() => {
  closeDatabase();
  invalidateStateCache();
  if (tempBase) rmSync(tempBase, { recursive: true, force: true });
  tempBase = null;
});

describe("stale slice row DB-authoritative boundary", () => {
  test("a stale SUMMARY.md projection does not make a DB-pending slice complete", async () => {
    tempBase = mkdtempSync(join(tmpdir(), "gsd-stale-slice-"));
    const sliceDir = join(tempBase, ".gsd", "milestones", "M001", "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });
    writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# S01 Summary\n", "utf-8");

    openDatabase(join(tempBase, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "DB authority", status: "active", depends_on: [] });
    insertSlice({
      id: "S01",
      milestoneId: "M001",
      title: "Still pending",
      status: "pending",
      risk: "low",
      depends: [],
      demo: "",
      sequence: 1,
    });

    const state = await deriveState(tempBase);

    assert.equal(state.activeSlice?.id, "S01");
    assert.equal(state.phase, "planning");
  });
});
