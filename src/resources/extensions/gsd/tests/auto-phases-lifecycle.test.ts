// Project/App: GSD-2
// File Purpose: Auto-loop phase lifecycle regression tests.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runFinalize } from "../auto/phases.ts";
import { AutoSession } from "../auto/session.ts";
import { readUnitRuntimeRecord, writeUnitRuntimeRecord } from "../unit-runtime.ts";
import { captureRootDirtySnapshot } from "../root-write-leak-guard.ts";

function runGit(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function initRepo(root: string): void {
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "test@example.com"]);
  runGit(root, ["config", "user.name", "Test User"]);
  writeFileSync(join(root, "index.html"), "<h1>Base</h1>\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "chore: init"]);
}

async function runSuccessfulFinalize(s: AutoSession) {
  const unit = s.currentUnit;
  assert.ok(unit, "test setup must provide currentUnit");

  writeUnitRuntimeRecord(s.basePath, unit.type, unit.id, unit.startedAt, {
    phase: "dispatched",
  });

  const deps = {
    clearUnitTimeout() {},
    buildSnapshotOpts() {
      return {};
    },
    stopAuto: async () => {},
    pauseAuto: async () => {},
    updateProgressWidget() {},
    postUnitPreVerification: async () => "continue",
    runPostUnitVerification: async () => "continue",
    postUnitPostVerification: async () => "continue",
  };

  return runFinalize(
    {
      ctx: { ui: { notify() {} } },
      pi: {},
      s,
      deps,
      prefs: undefined,
      iteration: 1,
      flowId: "flow-1",
      nextSeq: () => 1,
    } as any,
    {
      unitType: unit.type,
      unitId: unit.id,
      prompt: "",
      finalPrompt: "",
      pauseAfterUatDispatch: false,
      state: {} as any,
      mid: "M001",
      midTitle: "Milestone",
      isRetry: false,
      previousTier: undefined,
    },
    {
      recentUnits: [],
      stuckRecoveryAttempts: 0,
      consecutiveFinalizeTimeouts: 0,
    },
  );
}

async function runFinalizeWithDeps(
  s: AutoSession,
  depsOverrides: Record<string, unknown>,
  ctxOverride?: Record<string, unknown>,
) {
  const unit = s.currentUnit;
  assert.ok(unit, "test setup must provide currentUnit");

  writeUnitRuntimeRecord(s.basePath, unit.type, unit.id, unit.startedAt, {
    phase: "dispatched",
  });

  const deps = {
    clearUnitTimeout() {},
    buildSnapshotOpts() {
      return {};
    },
    stopAuto: async () => {},
    pauseAuto: async () => {},
    updateProgressWidget() {},
    postUnitPreVerification: async () => "continue",
    runPostUnitVerification: async () => "continue",
    postUnitPostVerification: async () => "continue",
    ...depsOverrides,
  };

  return runFinalize(
    {
      ctx: ctxOverride ?? { ui: { notify() {} } },
      pi: {},
      s,
      deps,
      prefs: undefined,
      iteration: 1,
      flowId: "flow-1",
      nextSeq: () => 1,
    } as any,
    {
      unitType: unit.type,
      unitId: unit.id,
      prompt: "",
      finalPrompt: "",
      pauseAfterUatDispatch: false,
      state: {} as any,
      mid: "M001",
      midTitle: "Milestone",
      isRetry: false,
      previousTier: undefined,
    },
    {
      recentUnits: [],
      stuckRecoveryAttempts: 0,
      consecutiveFinalizeTimeouts: 0,
    },
  );
}

test("runFinalize clears currentUnit after successful finalize", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-finalize-current-unit-"));
  const s = new AutoSession();
  s.basePath = base;
  s.currentUnit = {
    type: "execute-task",
    id: "M001/S01/T01",
    startedAt: Date.now(),
  };

  try {
    const result = await runSuccessfulFinalize(s);

    assert.equal(result.action, "next");
    assert.equal(s.currentUnit, null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("runFinalize marks unit runtime finalized after successful finalize", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-finalize-runtime-"));
  const s = new AutoSession();
  const startedAt = Date.now();
  s.basePath = base;
  s.currentUnit = {
    type: "complete-milestone",
    id: "M001",
    startedAt,
  };

  try {
    const result = await runSuccessfulFinalize(s);
    const runtime = readUnitRuntimeRecord(base, "complete-milestone", "M001");

    assert.equal(result.action, "next");
    assert.equal(runtime?.phase, "finalized");
    assert.equal(runtime?.lastProgressKind, "finalize-success");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("runFinalize merges a verified complete-milestone immediately and only once", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-finalize-merge-"));
  t.after(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const s = new AutoSession();
  const startedAt = Date.now();
  let lifecycleMergeCalls = 0;
  let resolverMergeCalls = 0;
  s.basePath = base;
  s.originalBasePath = base;
  s.currentMilestoneId = "M001";
  s.currentUnit = {
    type: "complete-milestone",
    id: "M001",
    startedAt,
  };

  const result = await runFinalizeWithDeps(s, {
    preflightCleanRoot: () => ({ stashPushed: false }),
    postflightPopStash: () => ({ needsManualRecovery: false }),
    resolver: {
      mergeAndExit() {
        resolverMergeCalls++;
      },
    },
    lifecycle: {
      exitMilestone(_mid: string, opts: { merge: boolean }) {
        if (opts.merge) lifecycleMergeCalls++;
        return { ok: true, merged: opts.merge, codeFilesChanged: false };
      },
    },
  });

  assert.equal(result.action, "next");
  assert.equal(lifecycleMergeCalls, 1);
  assert.equal(resolverMergeCalls, 0);
  assert.equal(s.milestoneMergedInPhases, true);

  s.currentUnit = {
    type: "complete-milestone",
    id: "M001",
    startedAt: startedAt + 1,
  };
  const second = await runFinalizeWithDeps(s, {
    preflightCleanRoot: () => ({ stashPushed: false }),
    postflightPopStash: () => ({ needsManualRecovery: false }),
    resolver: {
      mergeAndExit() {
        resolverMergeCalls++;
      },
    },
    lifecycle: {
      exitMilestone(_mid: string, opts: { merge: boolean }) {
        if (opts.merge) lifecycleMergeCalls++;
        return { ok: true, merged: opts.merge, codeFilesChanged: false };
      },
    },
  });

  assert.equal(second.action, "next");
  assert.equal(lifecycleMergeCalls, 1);
  assert.equal(resolverMergeCalls, 0);
});

test("runFinalize does not render next-phase handoff for complete-milestone", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-finalize-complete-handoff-"));
  t.after(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const s = new AutoSession();
  const widgetCalls: Array<[string, unknown]> = [];
  s.basePath = base;
  s.originalBasePath = base;
  s.currentMilestoneId = "M001";
  s.currentUnit = {
    type: "complete-milestone",
    id: "M001",
    startedAt: Date.now(),
  };

  const result = await runFinalizeWithDeps(
    s,
    {
      preflightCleanRoot: () => ({ stashPushed: false }),
      postflightPopStash: () => ({ needsManualRecovery: false }),
      lifecycle: {
        exitMilestone() {
          return { ok: true, merged: true, codeFilesChanged: false };
        },
      },
    },
    {
      hasUI: true,
      ui: {
        notify() {},
        setWidget(key: string, value: unknown) {
          widgetCalls.push([key, value]);
        },
      },
    },
  );

  assert.equal(result.action, "next");
  assert.equal(
    widgetCalls.some(([key]) => key === "gsd-outcome"),
    false,
    "complete-milestone finalize should leave terminal completion UI to stopAuto",
  );
});

test("runFinalize stops before merge when an isolated unit leaks app files into project root", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gsd-root-leak-root-"));
  const worktree = join(root, ".gsd", "worktrees", "M001");
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  initRepo(root);
  mkdirSync(worktree, { recursive: true });

  const s = new AutoSession();
  s.basePath = worktree;
  s.originalBasePath = root;
  s.currentMilestoneId = "M001";
  s.rootWriteBaseline = captureRootDirtySnapshot(root);
  s.currentUnit = {
    type: "execute-task",
    id: "M001/S01/T01",
    startedAt: Date.now(),
  };

  writeFileSync(join(root, "index.html"), "<h1>Leaked root edit</h1>\n");
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "tests", "verify-s09.sh"), "#!/usr/bin/env bash\n");

  const notifications: Array<{ message: string; level?: string }> = [];
  const stopCalls: Array<{ reason?: string; preserve?: boolean }> = [];
  const mergeCalls: string[] = [];
  const result = await runFinalizeWithDeps(
    s,
    {
      stopAuto: async (_ctx: unknown, _pi: unknown, reason?: string, options?: { preserveCompletedMilestoneBranch?: boolean }) => {
        stopCalls.push({ reason, preserve: options?.preserveCompletedMilestoneBranch });
      },
      preflightCleanRoot() {
        mergeCalls.push("preflight");
        return { stashPushed: false };
      },
      lifecycle: {
        exitMilestone() {
          mergeCalls.push("merge");
          return { ok: true, merged: true, codeFilesChanged: true };
        },
      },
    },
    {
      ui: {
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.equal(result.action, "break");
  assert.equal(result.reason, "root-write-leak");
  assert.deepEqual(stopCalls, [{ reason: "Root-write leak during isolated auto-mode", preserve: true }]);
  assert.deepEqual(mergeCalls, [], "root-write leak must stop before merge preflight");
  const message = notifications.find((n) => n.level === "error")?.message ?? "";
  assert.match(message, /execute-task M001\/S01\/T01/);
  assert.match(message, /Project root:/);
  assert.match(message, /Expected worktree:/);
  assert.match(message, /index\.html/);
  assert.match(message, /tests\/verify-s09\.sh/);
});

test("runFinalize allows root .gsd-only changes during isolated units", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gsd-root-leak-gsd-"));
  const worktree = join(root, ".gsd", "worktrees", "M001");
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  initRepo(root);
  mkdirSync(join(root, ".gsd"), { recursive: true });
  mkdirSync(worktree, { recursive: true });

  const s = new AutoSession();
  s.basePath = worktree;
  s.originalBasePath = root;
  s.currentMilestoneId = "M001";
  s.rootWriteBaseline = captureRootDirtySnapshot(root);
  s.currentUnit = {
    type: "execute-task",
    id: "M001/S01/T01",
    startedAt: Date.now(),
  };

  writeFileSync(join(root, ".gsd", "metrics.json"), "{}\n");

  const stopCalls: string[] = [];
  const result = await runFinalizeWithDeps(s, {
    stopAuto: async (_ctx: unknown, _pi: unknown, reason?: string) => {
      stopCalls.push(reason ?? "");
    },
  });

  assert.equal(result.action, "next");
  assert.deepEqual(stopCalls, []);
});
