/**
 * Regression test: invalidateAllCaches() must NOT wipe the artifacts table.
 *
 * Prior to this fix, `cache.ts` bundled `clearArtifacts()` (which runs
 * `DELETE FROM artifacts`) into `invalidateAllCaches()`. That helper fires
 * on every post-unit pass, so rows written by `saveArtifactToDb` and
 * `writeAndStore` (RESEARCH, CONTEXT, VALIDATION, ASSESSMENT, PLAN,
 * ROADMAP, task PLAN, task SUMMARY) got deleted within seconds of being
 * written. The milestone completed on disk, but `SELECT COUNT(*) FROM
 * artifacts` returned 0, and the agent fell into a "file exists but DB
 * record missing" recovery loop.
 *
 * The artifacts table is a write-through store, not a read cache. Routine
 * cache invalidation must preserve its contents.
 *
 * Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { invalidateAllCaches } from "../cache.ts";
import {
  openDatabase,
  closeDatabase,
  insertArtifact,
  isDbAvailable,
  _getAdapter,
} from "../gsd-db.ts";

afterEach(() => {
  if (isDbAvailable()) {
    try {
      closeDatabase();
    } catch {
      /* best-effort teardown */
    }
  }
});

describe("invalidateAllCaches() must preserve the artifacts table", () => {
  test("rows survive a single invalidate call", () => {
    const opened = openDatabase(":memory:");
    assert.equal(opened, true, "in-memory DB must open");

    insertArtifact({
      path: "milestones/M001/slices/S01/S01-RESEARCH.md",
      artifact_type: "RESEARCH",
      milestone_id: "M001",
      slice_id: "S01",
      task_id: null,
      full_content: "# Research\n\nFindings go here.\n",
    });

    invalidateAllCaches();

    const adapter = _getAdapter();
    assert.ok(adapter, "adapter should be available");
    const row = adapter!
      .prepare(
        "SELECT path, artifact_type, length(full_content) AS len FROM artifacts WHERE path = :path",
      )
      .get({ ":path": "milestones/M001/slices/S01/S01-RESEARCH.md" }) as
      | { path: string; artifact_type: string; len: number }
      | undefined;

    assert.ok(
      row,
      "artifact row must still exist after invalidateAllCaches — this is the Phase B bug",
    );
    assert.equal(row!.artifact_type, "RESEARCH");
    assert.ok((row!.len ?? 0) > 0, "full_content must not be truncated");
  });

  test("multiple rows for a full milestone survive repeated invalidates", () => {
    openDatabase(":memory:");

    const inserts = [
      {
        path: "milestones/M001/M001-ROADMAP.md",
        artifact_type: "ROADMAP",
        milestone_id: "M001",
        slice_id: null,
        task_id: null,
      },
      {
        path: "milestones/M001/slices/S01/S01-RESEARCH.md",
        artifact_type: "RESEARCH",
        milestone_id: "M001",
        slice_id: "S01",
        task_id: null,
      },
      {
        path: "milestones/M001/slices/S01/S01-PLAN.md",
        artifact_type: "PLAN",
        milestone_id: "M001",
        slice_id: "S01",
        task_id: null,
      },
      {
        path: "milestones/M001/slices/S01/tasks/T01-PLAN.md",
        artifact_type: "PLAN",
        milestone_id: "M001",
        slice_id: "S01",
        task_id: "T01",
      },
      {
        path: "milestones/M001/slices/S01/tasks/T01-SUMMARY.md",
        artifact_type: "SUMMARY",
        milestone_id: "M001",
        slice_id: "S01",
        task_id: "T01",
      },
      {
        path: "milestones/M001/M001-SUMMARY.md",
        artifact_type: "SUMMARY",
        milestone_id: "M001",
        slice_id: null,
        task_id: null,
      },
    ];

    for (const i of inserts) {
      insertArtifact({ ...i, full_content: `# ${i.artifact_type} content\n` });
    }

    // Simulate a full milestone's worth of post-unit cycles.
    for (let i = 0; i < 10; i++) {
      invalidateAllCaches();
    }

    const adapter = _getAdapter()!;
    const count = (
      adapter.prepare("SELECT COUNT(*) AS n FROM artifacts").get() as { n: number }
    ).n;

    assert.equal(
      count,
      inserts.length,
      `all ${inserts.length} artifact rows must survive repeated invalidate calls; got ${count}`,
    );
  });
});
