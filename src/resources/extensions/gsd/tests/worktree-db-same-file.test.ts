// GSD-2 — Worktree DB same-file reconciliation regression tests.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  openDatabase,
  closeDatabase,
  reconcileWorktreeDb,
  insertDecision,
} from "../gsd-db.ts";
import {
  _shouldReconcileWorktreeDb,
} from "../auto-worktree.ts";
import { isInfrastructureError } from "../auto/infra-errors.ts";

describe("#2823: reconcileWorktreeDb same-file guard", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-2823-"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns zero result when both paths resolve to the same file", () => {
    const mainGsd = join(tmpDir, "main", ".gsd");
    mkdirSync(mainGsd, { recursive: true });
    const mainDbPath = join(mainGsd, "gsd.db");

    openDatabase(mainDbPath);
    insertDecision({
      id: "D001",
      when_context: "2026-01-01",
      scope: "M001",
      decision: "Test decision",
      choice: "Test choice",
      rationale: "Test rationale",
      revisable: "yes",
      made_by: "agent",
      superseded_by: null,
    });

    const wtGsd = join(tmpDir, "worktree", ".gsd");
    mkdirSync(join(tmpDir, "worktree"), { recursive: true });
    symlinkSync(mainGsd, wtGsd, "junction");
    const worktreeDbPath = join(wtGsd, "gsd.db");

    assert.ok(existsSync(mainDbPath), "main DB exists");
    assert.ok(existsSync(worktreeDbPath), "worktree DB path exists via symlink");

    const result = reconcileWorktreeDb(mainDbPath, worktreeDbPath);

    assert.equal(result.decisions, 0, "no decisions reconciled");
    assert.equal(result.requirements, 0, "no requirements reconciled");
    assert.equal(result.artifacts, 0, "no artifacts reconciled");
    assert.equal(result.conflicts.length, 0, "no conflicts");
  });

  test("returns zero result when both paths are identical strings", () => {
    const mainGsd = join(tmpDir, "project", ".gsd");
    mkdirSync(mainGsd, { recursive: true });
    const dbPath = join(mainGsd, "gsd.db");

    openDatabase(dbPath);
    insertDecision({
      id: "D001",
      when_context: "2026-01-01",
      scope: "M001",
      decision: "Test",
      choice: "Test",
      rationale: "Test",
      revisable: "yes",
      made_by: "agent",
      superseded_by: null,
    });

    const result = reconcileWorktreeDb(dbPath, dbPath);

    assert.equal(result.decisions, 0);
    assert.equal(result.conflicts.length, 0);
  });

  test("still reconciles when paths are genuinely different files", () => {
    const mainGsd = join(tmpDir, "main", ".gsd");
    mkdirSync(mainGsd, { recursive: true });
    const mainDbPath = join(mainGsd, "gsd.db");

    openDatabase(mainDbPath);
    insertDecision({
      id: "D001",
      when_context: "2026-01-01",
      scope: "M001",
      decision: "Main decision",
      choice: "Main choice",
      rationale: "Main rationale",
      revisable: "yes",
      made_by: "agent",
      superseded_by: null,
    });
    closeDatabase();

    const wtGsd = join(tmpDir, "worktree", ".gsd");
    mkdirSync(wtGsd, { recursive: true });
    const worktreeDbPath = join(wtGsd, "gsd.db");

    openDatabase(worktreeDbPath);
    insertDecision({
      id: "D002",
      when_context: "2026-01-01",
      scope: "M001",
      decision: "WT decision",
      choice: "WT choice",
      rationale: "WT rationale",
      revisable: "yes",
      made_by: "agent",
      superseded_by: null,
    });
    closeDatabase();

    openDatabase(mainDbPath);
    const result = reconcileWorktreeDb(mainDbPath, worktreeDbPath);

    assert.ok(result.decisions > 0, "should reconcile decisions from a different DB");
  });
});

test("merge-time DB reconciliation requires an existing distinct worktree DB", () => {
  assert.equal(
    _shouldReconcileWorktreeDb("worktree.db", "main.db", () => true, () => false),
    true,
  );
  assert.equal(
    _shouldReconcileWorktreeDb("worktree.db", "main.db", () => false, () => false),
    false,
  );
  assert.equal(
    _shouldReconcileWorktreeDb("worktree.db", "main.db", () => true, () => true),
    false,
  );
});

describe("#2823: malformed DB classified as infrastructure error", () => {
  test("database disk image is malformed is detected as infra error", () => {
    const code = isInfrastructureError(new Error("database disk image is malformed"));
    assert.equal(code, "SQLITE_CORRUPT");
  });

  test("other SQLite errors are not falsely classified", () => {
    const code = isInfrastructureError(new Error("SQLITE_BUSY: database is locked"));
    assert.equal(code, null);
  });
});
