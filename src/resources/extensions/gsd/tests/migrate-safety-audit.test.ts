// GSD-2 - /gsd migrate safety and audit regression tests.
// File Purpose: Verifies migration hardening contracts for backup, target selection, archive, and DB projections.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import { generatePreview } from "../migrate/preview.ts";
import {
  assertMigrationHasSlices,
  assertMigrationTargetAvailable,
  prepareMigrationTarget,
  resolveMigrationPaths,
  restoreMigrationTarget,
} from "../migrate/safety.ts";
import {
  archiveLegacyPlanningDirectory,
  verifyMigrationProjection,
} from "../migrate/audit.ts";
import { executeMigrationWrite, importWrittenMigrationToDb } from "../migrate/command.ts";
import { writeGSDDirectory } from "../migrate/writer.ts";
import { closeDatabase, getArtifact } from "../gsd-db.ts";
import type { GSDProject } from "../migrate/types.ts";

function makeBase(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(base: string): void {
  closeDatabase();
  rmSync(base, { recursive: true, force: true });
}

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function createPlanningSource(base: string): string {
  const planning = join(base, ".planning");
  mkdirSync(planning, { recursive: true });
  write(join(planning, "config.json"), `${JSON.stringify({ projectName: "legacy" })}\n`);
  write(join(planning, "quick", "001-fix", "001-PLAN.md"), "# Quick task\n");
  write(join(planning, "STATE.md"), "# State\n\n**Status:** in-progress\n");
  return planning;
}

function projectFixture(): GSDProject {
  return {
    projectContent: "# Migrated Project\n\nA legacy project.\n",
    decisionsContent: "",
    requirements: [],
    milestones: [
      {
        id: "M001",
        title: "Migration",
        vision: "Carry the legacy work forward.",
        successCriteria: [],
        research: null,
        boundaryMap: [],
        slices: [
          {
            id: "S01",
            title: "First Slice",
            risk: "medium",
            depends: [],
            done: false,
            demo: "First slice works.",
            goal: "First slice works.",
            research: null,
            summary: null,
            tasks: [
              {
                id: "T01",
                title: "First Task",
                description: "Implement the first task.",
                done: false,
                estimate: "",
                files: [],
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

test("resolveMigrationPaths treats explicit source as target project root", () => {
  const cwd = "/tmp/current";

  assert.deepEqual(
    resolveMigrationPaths("/tmp/legacy-project", cwd),
    {
      sourcePath: "/tmp/legacy-project/.planning",
      targetRoot: "/tmp/legacy-project",
    },
  );

  assert.deepEqual(
    resolveMigrationPaths("/tmp/legacy-project/.planning", cwd),
    {
      sourcePath: "/tmp/legacy-project/.planning",
      targetRoot: "/tmp/legacy-project",
    },
  );
});

test("prepareMigrationTarget backs up and prunes stale .gsd before restore", () => {
  const base = makeBase("gsd-migrate-safety-");
  try {
    write(join(base, ".gsd", "STALE.md"), "old state\n");

    const backup = prepareMigrationTarget(base, new Date(2026, 4, 20, 12, 34, 56));
    assert.equal(backup.hadExistingGsd, true);
    assert.equal(basename(backup.backupPath!), "migrate-20260520-123456");
    assert.equal(existsSync(join(backup.backupPath!, "STALE.md")), true);
    assert.equal(existsSync(join(base, ".gsd")), false, "old .gsd is removed before fresh write");

    write(join(base, ".gsd", "NEW.md"), "failed migration output\n");
    restoreMigrationTarget(backup);

    assert.equal(existsSync(join(base, ".gsd", "STALE.md")), true, "backup restored");
    assert.equal(existsSync(join(base, ".gsd", "NEW.md")), false, "failed output pruned");
  } finally {
    cleanup(base);
  }
});

test("assertMigrationHasSlices blocks zero-slice migrations", () => {
  assert.throws(
    () => assertMigrationHasSlices({
      decisions: { total: 0 },
      milestoneCount: 1,
      totalSlices: 0,
      totalTasks: 0,
      doneSlices: 0,
      doneTasks: 0,
      sliceCompletionPct: 0,
      taskCompletionPct: 0,
      requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, total: 0 },
    }),
    /zero slices/,
  );
});

test("assertMigrationTargetAvailable blocks existing worktree state", async () => {
  const base = makeBase("gsd-migrate-worktree-block-");
  try {
    write(join(base, ".gsd", "worktrees", "M001", "marker"), "active worktree\n");
    await assert.rejects(
      () => assertMigrationTargetAvailable(base),
      /worktree state/,
    );
  } finally {
    cleanup(base);
  }
});

test("archiveLegacyPlanningDirectory preserves unmodeled legacy content with manifest", async () => {
  const base = makeBase("gsd-migrate-archive-");
  try {
    const planning = createPlanningSource(base);
    const archive = await archiveLegacyPlanningDirectory(planning, base);

    assert.equal(archive.archived, true);
    assert.equal(existsSync(join(base, ".gsd", "migration", "legacy", "planning", "quick", "001-fix", "001-PLAN.md")), true);
    assert.equal(existsSync(join(base, ".gsd", "migration", "legacy", "planning", "config.json")), true);

    const manifest = JSON.parse(readFileSync(archive.manifestPath, "utf-8"));
    assert.equal(manifest.strategy, "full-source-copy");
  } finally {
    cleanup(base);
  }
});

test("executeMigrationWrite restores backup when DB import verification fails", async () => {
  const base = makeBase("gsd-migrate-restore-");
  try {
    const planning = createPlanningSource(base);
    write(join(base, ".gsd", "OLD.md"), "known-good state\n");

    const project = projectFixture();
    const preview = generatePreview(project);

    await assert.rejects(
      () => executeMigrationWrite(planning, base, project, { ...preview, totalTasks: preview.totalTasks + 1 }),
      /migration DB import verification failed/,
    );

    assert.equal(existsSync(join(base, ".gsd", "OLD.md")), true, "original .gsd restored");
    assert.equal(existsSync(join(base, ".gsd", "migration", "MIGRATION.md")), false, "failed audit output removed");
  } finally {
    cleanup(base);
  }
});

test("executeMigrationWrite records audit artifacts and verifies DB-backed projection", async () => {
  const base = makeBase("gsd-migrate-success-");
  try {
    const planning = createPlanningSource(base);
    write(join(base, ".gsd", "STALE.md"), "old state\n");

    const project = projectFixture();
    const preview = generatePreview(project);
    const result = await executeMigrationWrite(planning, base, project, preview);

    assert.equal(existsSync(join(base, ".gsd", "STALE.md")), false, "fresh migration prunes stale files");
    assert.equal(existsSync(join(result.backup.backupPath!, "STALE.md")), true, "old .gsd was backed up");
    assert.equal(existsSync(join(base, ".gsd", "migration", "MIGRATION.md")), true);
    assert.equal(existsSync(join(base, ".gsd", "migration", "manifest.json")), true);
    assert.equal(existsSync(join(base, ".gsd", "migration", "legacy", "planning", "STATE.md")), true);

    assert.ok(getArtifact("migration/MIGRATION.md"), "migration audit imported as DB artifact");
    assert.ok(getArtifact("migration/manifest.json"), "migration manifest imported as DB artifact");
    assert.deepEqual(result.verification.db, { milestones: 1, slices: 1, tasks: 1 });
    assert.deepEqual(result.verification.markdown, { milestones: 1, slices: 1, tasks: 1 });
  } finally {
    cleanup(base);
  }
});

test("verifyMigrationProjection fails when DB hierarchy diverges from preview", async () => {
  const base = makeBase("gsd-migrate-projection-");
  try {
    const project = projectFixture();
    const preview = generatePreview(project);
    await writeGSDDirectory(project, base);
    await importWrittenMigrationToDb(base, preview);

    await assert.rejects(
      () => verifyMigrationProjection(base, { ...preview, totalTasks: preview.totalTasks + 1 }),
      /DB hierarchy/,
    );
  } finally {
    cleanup(base);
  }
});
