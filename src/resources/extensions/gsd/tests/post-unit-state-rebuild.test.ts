// Project/App: GSD-2
// File Purpose: Regression coverage for auto-mode post-unit state rebuild and artifact retry guards.
/**
 * Regression test for #3869: normal post-unit flow should rebuild STATE.md
 * before syncing worktree state back to the project root.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { AutoSession } from "../auto/session.ts";
import { postUnitPreVerification } from "../auto-post-unit.ts";
import { initMetrics, resetMetrics } from "../metrics.ts";
import { invalidateStateCache } from "../state.ts";
import {
  _getAdapter,
  closeDatabase,
  getTask,
  insertMilestone,
  insertSlice,
  insertTask,
  openDatabase,
} from "../gsd-db.ts";

const _require = createRequire(import.meta.url);

function openRawSqliteForTest(dbPath: string): { exec(sql: string): void; close(): void } {
  try {
    const mod = _require("node:sqlite") as { DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void } };
    return new mod.DatabaseSync(dbPath);
  } catch {
    type SqliteCtor = new (path: string) => { exec(sql: string): void; close(): void };
    const mod = _require("better-sqlite3") as SqliteCtor | { default: SqliteCtor };
    const DatabaseCtor: SqliteCtor = typeof mod === "function" ? mod : mod.default;
    return new DatabaseCtor(dbPath);
  }
}

function writeProjectPreferences(base: string): void {
  mkdirSync(join(base, ".gsd"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "PREFERENCES.md"),
    "---\nper_unit_cost_cap_usd: 99\n---\n",
    "utf-8",
  );
}

function writeSliceFixture(base: string, opts: { sliceDone: boolean }): void {
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  const sliceDir = join(milestoneDir, "slices", "S01");
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(milestoneDir, "M001-CONTEXT.md"),
    "---\nid: M001\ntitle: Test Milestone\n---\n\n# Test Milestone\n",
    "utf-8",
  );
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Test Milestone",
      "",
      "## Slices",
      "",
      `- [${opts.sliceDone ? "x" : " "}] **S01: Test Slice** \`risk:low\` \`depends:[]\``,
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(sliceDir, "S01-PLAN.md"),
    "# S01: Test Slice\n\n## Tasks\n\n- [x] **T01: Done** `est:5m`\n",
    "utf-8",
  );
  writeFileSync(join(tasksDir, "T01-SUMMARY.md"), "# T01\n\nDone.\n", "utf-8");
  writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# S01 Summary\n\nDone.\n", "utf-8");
}

function writeCostSpikeMetrics(base: string, unitId: string): void {
  mkdirSync(join(base, ".gsd"), { recursive: true });
  const now = Date.now();
  const unit = (id: string, cost: number, offset: number) => ({
    type: id === unitId ? "complete-slice" : "execute-task",
    id,
    model: "test/model",
    startedAt: now + offset,
    finishedAt: now + offset + 1,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost,
    toolCalls: 0,
    assistantMessages: 0,
    userMessages: 0,
  });
  writeFileSync(
    join(base, ".gsd", "metrics.json"),
    JSON.stringify({
      version: 1,
      projectStartedAt: now,
      units: [
        unit("M001/S01/T00", 0.1, 0),
        unit("M001/S01/T01", 0.1, 2),
        unit("M001/S01/T02", 0.1, 4),
        unit("M001/S01/T03", 0.1, 6),
        unit(unitId, 3.0, 8),
      ],
    }),
    "utf-8",
  );
}

function openPostUnitDb(base: string, opts: { sliceStatus: "pending" | "complete" }): void {
  closeDatabase();
  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test Milestone", status: "active", depends_on: [] });
  insertSlice({
    id: "S01",
    milestoneId: "M001",
    title: "Test Slice",
    status: opts.sliceStatus,
    risk: "low",
    depends: [],
    demo: "",
    sequence: 1,
  });
  insertTask({
    id: "T01",
    sliceId: "S01",
    milestoneId: "M001",
    title: "Done",
    status: "complete",
    sequence: 1,
  });
}

function makeCompleteSliceSession(base: string): AutoSession {
  const s = new AutoSession();
  s.basePath = base;
  s.originalBasePath = base;
  s.currentMilestoneId = "M001";
  s.currentUnit = { type: "complete-slice", id: "M001/S01", startedAt: Date.now() };
  return s;
}

function makePostUnitContext(s: AutoSession, notifications: string[], pauseCalls: { count: number }) {
  return {
    s,
    ctx: { ui: { notify(message: string) { notifications.push(message); } } } as any,
    pi: {} as any,
    buildSnapshotOpts: () => ({}),
    lockBase: () => s.basePath,
    stopAuto: async () => {},
    pauseAuto: async () => { pauseCalls.count += 1; },
    updateProgressWidget: () => {},
  };
}

test("postUnitPreVerification rebuilds STATE.md after a completed unit", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-state-"));
  try {
    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# Roadmap\n\n## Slices\n\n- [ ] **S01: Discussed slice** `risk:low` `depends:[]`\n",
    );
    writeFileSync(join(sliceDir, "S01-CONTEXT.md"), "# Slice Context\n\nReady.\n");

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "discuss-slice", id: "M001/S01", startedAt: Date.now() };

    const result = await postUnitPreVerification({
      s,
      ctx: { ui: { notify() {} } } as any,
      pi: {} as any,
      buildSnapshotOpts: () => ({}),
      lockBase: () => base,
      stopAuto: async () => {},
      pauseAuto: async () => {},
      updateProgressWidget: () => {},
    }, { skipSettleDelay: true, skipWorktreeSync: true });

    assert.equal(result, "continue");
    const statePath = join(base, ".gsd", "STATE.md");
    assert.equal(existsSync(statePath), true);
    assert.ok(readFileSync(statePath, "utf-8").includes("M001"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification refreshes DB before checking execute-task completion", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-db-refresh-"));
  try {
    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    const tasksDir = join(sliceDir, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# Roadmap\n\n## Slices\n\n- [ ] **S01: Slice** `risk:low` `depends:[]`\n",
    );
    writeFileSync(
      join(sliceDir, "S01-PLAN.md"),
      "# S01: Slice\n\n## Tasks\n\n- [ ] **T01: Do work** `est:30m`\n",
    );
    writeFileSync(
      join(tasksDir, "T01-SUMMARY.md"),
      "---\nid: T01\nparent: S01\nmilestone: M001\n---\n# T01\nDone.\n",
    );

    const dbPath = join(base, ".gsd", "gsd.db");
    openDatabase(dbPath);
    insertMilestone({ id: "M001", title: "Milestone", status: "active" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "pending" });
    insertTask({ id: "T01", sliceId: "S01", milestoneId: "M001", title: "Do work", status: "pending" });
    const adapterBefore = _getAdapter();

    const externalDb = openRawSqliteForTest(dbPath);
    try {
      externalDb.exec("UPDATE tasks SET status = 'complete', completed_at = '2026-05-14T00:00:00.000Z' WHERE milestone_id = 'M001' AND slice_id = 'S01' AND id = 'T01'");
    } finally {
      externalDb.close();
    }

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "execute-task", id: "M001/S01/T01", startedAt: Date.now() };

    const result = await postUnitPreVerification({
      s,
      ctx: { ui: { notify() {} } } as any,
      pi: {} as any,
      buildSnapshotOpts: () => ({}),
      lockBase: () => base,
      stopAuto: async () => {},
      pauseAuto: async () => {},
      updateProgressWidget: () => {},
    }, { skipSettleDelay: true, skipWorktreeSync: true });

    assert.equal(result, "continue");
    assert.notEqual(_getAdapter(), adapterBefore, "post-unit flow must reopen the DB before deriving state");
    assert.equal(getTask("M001", "S01", "T01")?.status, "complete");
    assert.equal(s.pendingVerificationRetry, null);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification continues closeout when artifact cost spike is obsolete", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-cost-advanced-"));
  const notifications: string[] = [];
  const pauseCalls = { count: 0 };
  try {
    writeProjectPreferences(base);
    writeSliceFixture(base, { sliceDone: true });
    openPostUnitDb(base, { sliceStatus: "complete" });
    writeCostSpikeMetrics(base, "M001/S01");
    initMetrics(base);

    const s = makeCompleteSliceSession(base);
    const result = await postUnitPreVerification(
      makePostUnitContext(s, notifications, pauseCalls),
      { skipSettleDelay: true, skipWorktreeSync: true },
    );

    assert.equal(result, "continue");
    assert.equal(pauseCalls.count, 0);
    assert.equal(s.pendingVerificationRetry, null);
    assert.ok(
      notifications.some((message) => message.includes("cost spike detected") && message.includes("continuing closeout")),
      "user should still see the cost spike warning when auto continues closeout",
    );
  } finally {
    resetMetrics();
    invalidateStateCache();
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification repairs stale complete-slice roadmap projection without retry", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-slice-roadmap-"));
  const notifications: string[] = [];
  const pauseCalls = { count: 0 };
  try {
    writeProjectPreferences(base);
    writeSliceFixture(base, { sliceDone: false });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-UAT.md"),
      "# S01 UAT\n\nPassed.\n",
      "utf-8",
    );
    openPostUnitDb(base, { sliceStatus: "complete" });

    const s = makeCompleteSliceSession(base);
    const result = await postUnitPreVerification(
      makePostUnitContext(s, notifications, pauseCalls),
      { skipSettleDelay: true, skipWorktreeSync: true },
    );

    assert.equal(result, "continue");
    assert.equal(pauseCalls.count, 0);
    assert.equal(s.pendingVerificationRetry, null);
    assert.match(
      readFileSync(join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"), "utf-8"),
      /- \[x\] \*\*S01:/,
      "complete-slice closeout should repair ROADMAP from DB instead of retrying the closer",
    );
  } finally {
    invalidateStateCache();
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification accepts validation invalidated by same-turn reassessment", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-validation-reassess-"));
  const notifications: string[] = [];
  const pauseCalls = { count: 0 };
  try {
    writeProjectPreferences(base);
    const milestoneDir = join(base, ".gsd", "milestones", "M001");
    const sliceDir = join(milestoneDir, "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });
    writeFileSync(
      join(milestoneDir, "M001-ROADMAP.md"),
      [
        "# M001: Test Milestone",
        "",
        "## Slices",
        "",
        "- [x] **S01: Done** `risk:low` `depends:[]`",
        "- [ ] **S02: Remediation** `risk:medium` `depends:[S01]`",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# S01\n\nDone.\n", "utf-8");

    closeDatabase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Test Milestone", status: "active", depends_on: [] });
    insertSlice({
      id: "S01",
      milestoneId: "M001",
      title: "Done",
      status: "complete",
      risk: "low",
      depends: [],
      demo: "",
      sequence: 1,
    });
    insertSlice({
      id: "S02",
      milestoneId: "M001",
      title: "Remediation",
      status: "pending",
      risk: "medium",
      depends: ["S01"],
      demo: "",
      sequence: 2,
    });

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "validate-milestone", id: "M001", startedAt: Date.now() };
    s.pendingVerificationRetry = {
      unitId: "M001",
      failureContext: "stale validation artifact retry",
      attempt: 1,
    };

    const result = await postUnitPreVerification(
      makePostUnitContext(s, notifications, pauseCalls),
      {
        skipSettleDelay: true,
        skipWorktreeSync: true,
        agentEndMessages: [{
          role: "assistant",
          content: [{
            type: "toolCall",
            id: "add-remediation-slice",
            name: "gsd_reassess_roadmap",
            arguments: { milestoneId: "M001" },
          }],
        }],
      },
    );

    assert.equal(result, "continue");
    assert.equal(pauseCalls.count, 0);
    assert.equal(s.pendingVerificationRetry, null);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification accepts successful reassessment result even before slice state refresh", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-reassess-result-"));
  const notifications: string[] = [];
  const pauseCalls = { count: 0 };
  try {
    writeProjectPreferences(base);
    mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });

    closeDatabase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Test Milestone", status: "active", depends_on: [] });

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "validate-milestone", id: "M001", startedAt: Date.now() };

    const result = await postUnitPreVerification(
      makePostUnitContext(s, notifications, pauseCalls),
      {
        skipSettleDelay: true,
        skipWorktreeSync: true,
        agentEndMessages: [{
          role: "toolResult",
          toolName: "gsd_reassess_roadmap",
          isError: false,
          content: [{ type: "text", text: "Reassessed roadmap for milestone M001 after S01" }],
        }],
      },
    );

    assert.equal(result, "continue");
    assert.equal(pauseCalls.count, 0);
    assert.equal(s.pendingVerificationRetry, null);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification accepts validation replaced by reassessment artifact on disk", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-reassess-disk-"));
  const notifications: string[] = [];
  const pauseCalls = { count: 0 };
  try {
    writeProjectPreferences(base);
    const assessmentDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    mkdirSync(assessmentDir, { recursive: true });
    writeFileSync(join(assessmentDir, "S01-ASSESSMENT.md"), "# S01 Assessment\n\nAdd S02.\n", "utf-8");

    closeDatabase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Test Milestone", status: "active", depends_on: [] });

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "validate-milestone", id: "M001", startedAt: Date.now() };

    const result = await postUnitPreVerification(
      makePostUnitContext(s, notifications, pauseCalls),
      { skipSettleDelay: true, skipWorktreeSync: true },
    );

    assert.equal(result, "continue");
    assert.equal(pauseCalls.count, 0);
    assert.equal(s.pendingVerificationRetry, null);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification still pauses on artifact cost spike when same unit remains next", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-cost-same-"));
  const notifications: string[] = [];
  const pauseCalls = { count: 0 };
  try {
    writeProjectPreferences(base);
    writeSliceFixture(base, { sliceDone: false });
    openPostUnitDb(base, { sliceStatus: "pending" });
    writeCostSpikeMetrics(base, "M001/S01");
    initMetrics(base);

    const s = makeCompleteSliceSession(base);
    const result = await postUnitPreVerification(
      makePostUnitContext(s, notifications, pauseCalls),
      { skipSettleDelay: true, skipWorktreeSync: true },
    );

    assert.equal(result, "dispatched");
    assert.equal(pauseCalls.count, 1);
    assert.equal(s.pendingVerificationRetry, null);
    assert.ok(
      notifications.some((message) => message.includes("cost spike detected") && message.includes("pausing auto-mode")),
      "same-unit cost spike should pause instead of retrying indefinitely",
    );
  } finally {
    resetMetrics();
    invalidateStateCache();
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification pauses instead of retrying when closeout failure marker exists", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-failure-marker-"));
  try {
    const milestoneDir = join(base, ".gsd", "milestones", "M001");
    mkdirSync(milestoneDir, { recursive: true });
    openDatabase(join(base, ".gsd", "gsd.db"));
    writeFileSync(
      join(milestoneDir, "M001-VERIFICATION-FAILED.md"),
      "# Verification Failed\n\nverdict: needs-attention\n",
    );

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "complete-milestone", id: "M001", startedAt: Date.now() };
    const retryKey = `${s.currentUnit.type}:${s.currentUnit.id}`;
    s.pendingVerificationRetry = {
      unitId: s.currentUnit.id,
      failureContext: "seeded failure context",
      attempt: 2,
    };
    s.verificationRetryCount.set(retryKey, 2);
    s.verificationRetryFailureHashes.set(retryKey, "seeded-hash");

    let pauseCalls = 0;
    const notifyPayloads: unknown[] = [];
    const result = await postUnitPreVerification({
      s,
      ctx: { ui: { notify(payload: unknown) { notifyPayloads.push(payload); } } } as any,
      pi: {} as any,
      buildSnapshotOpts: () => ({}),
      lockBase: () => base,
      stopAuto: async () => {},
      pauseAuto: async () => { pauseCalls += 1; },
      updateProgressWidget: () => {},
    }, { skipSettleDelay: true, skipWorktreeSync: true });

    assert.equal(result, "dispatched");
    assert.equal(pauseCalls, 1);
    assert.ok(
      notifyPayloads.some((payload) => JSON.stringify(payload).includes("M001-VERIFICATION-FAILED.md")),
      "should notify marker-path closeout failure to UI",
    );
    assert.equal(s.pendingVerificationRetry, null);
    assert.equal(s.verificationRetryCount.size, 0);
    assert.equal(s.verificationRetryFailureHashes.size, 0);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});
