/**
 * dispatcher-stuck-planning.test.ts
 *
 * Verify that state.ts no longer imports disk PLAN.md tasks into the runtime
 * DB. PLAN.md is a projection; task rows must be created through DB-backed
 * planning/import APIs.
 */

import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { closeDatabase, insertMilestone, insertSlice, openDatabase } from "../gsd-db.ts";
import { deriveStateFromDb, invalidateStateCache } from "../state.ts";

describe("dispatcher DB-authoritative planning boundary", () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "gsd-dispatcher-planning-"));
    mkdirSync(join(base, ".gsd", "milestones", "M001", "S01"), { recursive: true });
    writeFileSync(join(base, ".gsd", "milestones", "M001", "CONTEXT.md"), "# M001\n");
    writeFileSync(join(base, ".gsd", "milestones", "M001", "ROADMAP.md"), [
      "## Slices",
      "- [ ] **S01: Build** `risk:low` `depends:[]`",
    ].join("\n"));
    writeFileSync(join(base, ".gsd", "milestones", "M001", "S01", "PLAN.md"), [
      "## Tasks",
      "- [ ] **T01: Projection-only task**",
    ].join("\n"));
    openDatabase(join(base, ".gsd", "gsd.db"));
  });

  afterEach(() => {
    closeDatabase();
    invalidateStateCache();
    rmSync(base, { recursive: true, force: true });
  });

  test("PLAN.md projection tasks are not imported into runtime DB state", async () => {
    insertMilestone({ id: "M001", title: "Milestone 1", status: "active", depends_on: [] });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Build", status: "active", depends: [] });

    const state = await deriveStateFromDb(base);

    assert.equal(state.phase, "planning");
    assert.equal(state.activeTask, null);
    assert.match(
      state.nextAction ?? "",
      /Slice S01 has no DB tasks\. Plan slice tasks before execution\./,
    );
  });
});
