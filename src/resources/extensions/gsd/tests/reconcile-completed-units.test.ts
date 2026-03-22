import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { reconcileCompletedUnits } from "../auto-recovery.ts";
import { clearPathCache } from "../paths.ts";
import { clearParseCache } from "../files.ts";
import { invalidateAllCaches } from "../cache.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-reconcile-${randomUUID()}`);
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

function writeRoadmap(base: string, slices: string): void {
  const mDir = join(base, ".gsd", "milestones", "M001");
  writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone\n\n## Slices\n${slices}\n`);
}

function writeCompletedUnits(base: string, keys: string[]): void {
  writeFileSync(join(base, ".gsd", "completed-units.json"), JSON.stringify(keys, null, 2));
}

function readCompletedUnits(base: string): string[] {
  return JSON.parse(readFileSync(join(base, ".gsd", "completed-units.json"), "utf-8"));
}

// ─── Reproduction: artifact exists but unit missing from completed-units ───

test("reconcileCompletedUnits adds plan-slice when artifact exists but not in completed-units", () => {
  const base = makeTmpBase();
  try {
    clearPathCache();
    clearParseCache();
    invalidateAllCaches();

    writeRoadmap(base, `- [ ] **S01: Demo** \`risk:low\` \`depends:[]\`\n  > After this: demo`);

    // Write the plan-slice artifact (S01-PLAN.md) + task plan — simulates crash after write
    const sDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sDir, "S01-PLAN.md"), "# S01: Plan\n\n## Tasks\n- [ ] **T01: Do thing** `est:10m`\n");
    writeFileSync(join(sDir, "tasks", "T01-PLAN.md"), "# T01: Do thing\n\nPlan details.\n");

    // completed-units.json only has research — plan-slice is missing (crash gap)
    writeCompletedUnits(base, ["research-slice/M001/S01"]);

    const added = reconcileCompletedUnits(base, "M001");

    assert.ok(added.length > 0, "should have reconciled at least one unit");
    assert.ok(
      added.some(u => u.type === "plan-slice" && u.id === "M001/S01"),
      "should reconcile plan-slice/M001/S01",
    );

    // Verify it was persisted to disk
    const persisted = readCompletedUnits(base);
    assert.ok(persisted.includes("plan-slice/M001/S01"), "plan-slice should be in persisted file");
    assert.ok(persisted.includes("research-slice/M001/S01"), "existing entries should be preserved");
  } finally {
    cleanup(base);
  }
});

test("reconcileCompletedUnits does not duplicate existing entries", () => {
  const base = makeTmpBase();
  try {
    clearPathCache();
    clearParseCache();
    invalidateAllCaches();

    writeRoadmap(base, `- [ ] **S01: Demo** \`risk:low\` \`depends:[]\`\n  > After this: demo`);

    const sDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sDir, "S01-PLAN.md"), "# S01: Plan\n\n## Tasks\n- [ ] **T01: Do thing** `est:10m`\n");
    writeFileSync(join(sDir, "tasks", "T01-PLAN.md"), "# T01: Do thing\n\nPlan details.\n");

    // plan-slice and plan-milestone are already in completed-units
    writeCompletedUnits(base, ["research-slice/M001/S01", "plan-slice/M001/S01", "plan-milestone/M001"]);

    const added = reconcileCompletedUnits(base, "M001");

    assert.equal(added.length, 0, "should not add duplicates");
    const persisted = readCompletedUnits(base);
    const planCount = persisted.filter(k => k === "plan-slice/M001/S01").length;
    assert.equal(planCount, 1, "no duplicate entries in persisted file");
  } finally {
    cleanup(base);
  }
});

test("reconcileCompletedUnits returns empty when no slice artifacts exist on disk", () => {
  const base = makeTmpBase();
  try {
    clearPathCache();
    clearParseCache();
    invalidateAllCaches();

    writeRoadmap(base, `- [ ] **S01: Demo** \`risk:low\` \`depends:[]\`\n  > After this: demo`);

    // The roadmap itself exists (plan-milestone artifact), so mark it already completed.
    // No slice-level artifacts exist — nothing else to reconcile.
    writeCompletedUnits(base, ["plan-milestone/M001"]);

    const added = reconcileCompletedUnits(base, "M001");

    // Should not reconcile any slice-level units (no S01-RESEARCH.md, no S01-PLAN.md, etc.)
    const sliceUnits = added.filter(u => u.id.includes("/"));
    assert.equal(sliceUnits.length, 0, "no slice artifacts to reconcile");
  } finally {
    cleanup(base);
  }
});

test("reconcileCompletedUnits reconciles research-slice artifact", () => {
  const base = makeTmpBase();
  try {
    clearPathCache();
    clearParseCache();
    invalidateAllCaches();

    writeRoadmap(base, `- [ ] **S01: Demo** \`risk:low\` \`depends:[]\`\n  > After this: demo`);

    const sDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sDir, "S01-RESEARCH.md"), "# S01: Research\n\nFindings here.\n");

    writeCompletedUnits(base, []);

    const added = reconcileCompletedUnits(base, "M001");

    assert.ok(
      added.some(u => u.type === "research-slice" && u.id === "M001/S01"),
      "should reconcile research-slice/M001/S01",
    );
  } finally {
    cleanup(base);
  }
});

test("reconcileCompletedUnits handles missing completed-units.json gracefully", () => {
  const base = makeTmpBase();
  try {
    clearPathCache();
    clearParseCache();
    invalidateAllCaches();

    writeRoadmap(base, `- [ ] **S01: Demo** \`risk:low\` \`depends:[]\`\n  > After this: demo`);

    const sDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sDir, "S01-PLAN.md"), "# S01: Plan\n\n## Tasks\n- [ ] **T01: Do thing** `est:10m`\n");
    writeFileSync(join(sDir, "tasks", "T01-PLAN.md"), "# T01: Do thing\n\nPlan details.\n");

    // No completed-units.json exists at all
    const added = reconcileCompletedUnits(base, "M001");

    assert.ok(added.length > 0, "should reconcile even without existing file");
    const persisted = readCompletedUnits(base);
    assert.ok(persisted.includes("plan-slice/M001/S01"), "should create the file with reconciled entries");
  } finally {
    cleanup(base);
  }
});
