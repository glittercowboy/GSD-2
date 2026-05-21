// Project/App: GSD-2
// File Purpose: Regression tests for DB authority over markdown projections.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  closeDatabase,
  getAllMilestones,
  getSliceTasks,
  insertMilestone,
  insertRequirement,
  insertSlice,
  openDatabase,
} from "../gsd-db.ts";
import { migrateHierarchyToDb } from "../md-importer.ts";
import { checkMarkdownHierarchyAgainstDb } from "../migration-auto-check.ts";
import { queryDecisions } from "../context-store.ts";
import { deriveStateFromDb, invalidateStateCache } from "../state.ts";
import type { Requirement } from "../types.ts";

function makeBase(prefix = "gsd-db-authority-"): string {
  const base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try {
    closeDatabase();
  } catch {
    /* noop */
  }
  rmSync(base, { recursive: true, force: true });
}

function openProjectDb(base: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
}

function activeRequirement(id: string): Requirement {
  return {
    id,
    class: "functional",
    status: "active",
    description: `${id} from DB`,
    why: "DB authority regression fixture",
    source: "test",
    primary_owner: "M999/S01",
    supporting_slices: "",
    validation: "derive state",
    notes: "",
    full_content: `${id} from DB`,
    superseded_by: null,
  };
}

test("DB authority: PROJECT.md and QUEUE-ORDER projections do not choose runtime milestone", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));

  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "PROJECT.md"),
    [
      "# Projection Project",
      "",
      "## Milestone Sequence",
      "- [ ] M001: Projection Only -- should not become active",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(base, ".gsd", "QUEUE-ORDER.json"),
    JSON.stringify({ order: ["M001", "M999"], updatedAt: new Date().toISOString() }),
  );

  openProjectDb(base);
  insertMilestone({ id: "M999", title: "DB Milestone", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M999", title: "DB Slice", status: "pending", risk: "low", depends: [], demo: "DB demo", sequence: 1 });

  invalidateStateCache();
  const state = await deriveStateFromDb(base);

  assert.equal(state.activeMilestone?.id, "M999");
  assert.equal(state.registry.some((entry) => entry.id === "M001"), false);
});

test("DB authority: REQUIREMENTS.md and DECISIONS.md projections do not populate DB reads", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));

  writeFileSync(
    join(base, ".gsd", "REQUIREMENTS.md"),
    [
      "# Requirements",
      "",
      "## Active",
      "### R001 - Projection-only requirement",
      "- Class: functional",
      "- Status: active",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(base, ".gsd", "DECISIONS.md"),
    [
      "# Decisions",
      "",
      "| # | When / Context | Scope | Decision | Choice | Rationale | Revisable | Made By |",
      "|---|----------------|-------|----------|--------|-----------|----------|---------|",
      "| D001 | Now | global | Projection-only decision | Ignore | DB is authority | Yes | human |",
      "",
    ].join("\n"),
  );

  openProjectDb(base);
  insertMilestone({ id: "M999", title: "DB Milestone", status: "active" });

  invalidateStateCache();
  const state = await deriveStateFromDb(base);

  assert.deepEqual(state.requirements, {
    active: 0,
    validated: 0,
    deferred: 0,
    outOfScope: 0,
    blocked: 0,
    total: 0,
  });
  assert.deepEqual(queryDecisions(), []);
});

test("DB authority: DB requirements remain canonical when REQUIREMENTS.md disagrees", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));

  writeFileSync(
    join(base, ".gsd", "REQUIREMENTS.md"),
    [
      "# Requirements",
      "",
      "## Active",
      "### R999 - Projection-only requirement",
      "- Class: functional",
      "- Status: active",
      "",
    ].join("\n"),
  );

  openProjectDb(base);
  insertMilestone({ id: "M999", title: "DB Milestone", status: "active" });
  insertRequirement(activeRequirement("R001"));

  invalidateStateCache();
  const state = await deriveStateFromDb(base);

  assert.ok(state.requirements);
  assert.equal(state.requirements.active, 1);
  assert.equal(state.requirements.total, 1);
});

test("explicit markdown import remains opt-in and is not run by startup mismatch check", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));

  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  const sliceDir = join(milestoneDir, "slices", "S01");
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Imported Explicitly",
      "",
      "**Vision:** Explicit recovery import only",
      "",
      "## Slices",
      "- [ ] **S01: Slice** `risk:low` `depends:[]`",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(sliceDir, "S01-PLAN.md"),
    [
      "# S01: Slice",
      "",
      "**Goal:** prove explicit import",
      "",
      "## Tasks",
      "- [ ] **T01: Task** `est:5m`",
      "",
    ].join("\n"),
  );

  openProjectDb(base);
  const check = await checkMarkdownHierarchyAgainstDb(base);
  assert.equal(check.action, "recovery-required");
  assert.equal(getAllMilestones().length, 0, "startup mismatch check must not import markdown");

  const imported = migrateHierarchyToDb(base);
  assert.deepEqual(imported, { milestones: 1, slices: 1, tasks: 1 });
  assert.equal(getAllMilestones().length, 1);
  assert.equal(getSliceTasks("M001", "S01").length, 1);
});
