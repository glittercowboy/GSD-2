import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

/**
 * Initialize the temp dir as a real git repo with a `.gsd/preferences.md`
 * declaring the requested isolation mode. Required after ADR-016 phase 2 /
 * C1+C2+C3 inlined the worktree-manager + cache + preferences primitives —
 * tests can no longer stub them via deps.
 */
function initGitRepoIn(base: string, isolation: "worktree" | "branch" | "none"): void {
  const git = (args: string[]): void => {
    execFileSync("git", args, { cwd: base, stdio: "pipe" });
  };
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@test.com"]);
  git(["config", "user.name", "Test"]);
  writeFileSync(join(base, "README.md"), "# test\n");
  writeFileSync(join(base, ".gitignore"), ".gsd/worktrees/\n");
  mkdirSync(join(base, ".gsd"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "preferences.md"),
    `## Git\n- isolation: ${isolation}\n`,
  );
  git(["add", "."]);
  git(["commit", "-m", "init"]);
}
import {
  WorktreeLifecycle,
  resetRecentWorktreeMergeFailuresForTest,
  type WorktreeLifecycleDeps,
  type NotifyCtx,
} from "../worktree-lifecycle.js";
import { WorktreeStateProjection } from "../worktree-state-projection.js";
import { type TaskCommitContext } from "../worktree.js";
import { MergeConflictError } from "../git-service.js";

// ADR-016 phase 2 / C-track retired all worktree-manager + cache + prefs
// fields from `WorktreeLifecycleDeps`. Tests still pass them as overrides
// via the structural-typing escape hatch — listed here as optional so
// fixtures can stub or omit them.
type LegacyTestDeps = WorktreeLifecycleDeps & {
  enterAutoWorktree?: (basePath: string, milestoneId: string) => string;
  createAutoWorktree?: (basePath: string, milestoneId: string) => string;
  enterBranchModeForMilestone?: (basePath: string, milestoneId: string) => void;
  getAutoWorktreePath?: (basePath: string, milestoneId: string) => string | null;
  isInAutoWorktree?: (basePath: string) => boolean;
  autoWorktreeBranch?: (milestoneId: string) => string;
  teardownAutoWorktree?: (
    basePath: string,
    milestoneId: string,
    opts?: { preserveBranch?: boolean },
  ) => void;
  shouldUseWorktreeIsolation?: () => boolean;
  syncWorktreeStateBack?: (
    mainBasePath: string,
    worktreePath: string,
    milestoneId: string,
  ) => { synced: string[] };
  captureIntegrationBranch?: (basePath: string, mid: string | undefined) => void;
  autoCommitCurrentBranch?: (
    basePath: string,
    unitType: string,
    unitId: string,
    taskContext?: TaskCommitContext,
  ) => string | null;
  getCurrentBranch?: (basePath: string) => string;
  checkoutBranch?: (basePath: string, branch: string) => void;
  readFileSync?: (path: string, encoding: BufferEncoding) => string;
  getIsolationMode?: (basePath?: string) => "worktree" | "branch" | "none";
  resolveMilestoneFile?: (
    basePath: string,
    milestoneId: string,
    fileType: string,
  ) => string | null;
  GitServiceImpl?: new (basePath: string, gitConfig: unknown) => unknown;
  loadEffectiveGSDPreferences?: () =>
    | { preferences?: { git?: Record<string, unknown> } }
    | null
    | undefined;
  invalidateAllCaches?: () => void;
};
import { AutoSession } from "../auto/session.js";
import type { JournalEntry } from "../journal.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(
  overrides?: Partial<{ basePath: string; originalBasePath: string }>,
): AutoSession {
  const s = new AutoSession();
  s.basePath = overrides?.basePath ?? "/project";
  s.originalBasePath = overrides?.originalBasePath ?? "/project";
  return s;
}

function makeDeps(
  overrides?: Partial<LegacyTestDeps>,
): LegacyTestDeps {
  // ADR-016 phase 2 / C-track retired the worktree-manager + cache + prefs
  // primitives from `WorktreeLifecycleDeps`. Tests in this file drive
  // Lifecycle against real git fixtures (initGitRepoIn) — do NOT stub the
  // C-track primitives here, or the override pattern will pre-empt the
  // real `getAutoWorktreePath` / `createAutoWorktree` / etc. and the
  // success/existing/failure branches won't fire as expected.
  const deps: LegacyTestDeps = {
    mergeMilestoneToMain: () => ({ pushed: false, codeFilesChanged: true }),
    worktreeProjection: new WorktreeStateProjection(),
    // ADR-016 phase 2 / C4 (#5627): GitServiceImpl constructor → factory.
    gitServiceFactory: () => ({}) as unknown as ReturnType<
      WorktreeLifecycleDeps["gitServiceFactory"]
    >,
    ...overrides,
  };
  return deps;
}

function makeNotifyCtx(): NotifyCtx {
  return {
    notify: () => {},
  };
}

/** Read all journal entries from a temp .gsd/journal directory. */
function readJournalEntries(basePath: string): JournalEntry[] {
  const journalDir = join(basePath, ".gsd", "journal");
  try {
    const files = readdirSync(journalDir).filter(f => f.endsWith(".jsonl")).sort();
    const entries: JournalEntry[] = [];
    for (const file of files) {
      const raw = readFileSync(join(journalDir, file), "utf-8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        entries.push(JSON.parse(line) as JournalEntry);
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function setupMergeWorktree(basePath: string, milestoneId: string): string {
  initGitRepoIn(basePath, "worktree");
  execFileSync("git", ["checkout", "-b", `milestone/${milestoneId}`], { cwd: basePath, stdio: "pipe" });
  execFileSync("git", ["checkout", "main"], { cwd: basePath, stdio: "pipe" });
  const wt = join(basePath, ".gsd", "worktrees", milestoneId);
  execFileSync("git", ["worktree", "add", wt, `milestone/${milestoneId}`], { cwd: basePath, stdio: "pipe" });
  mkdirSync(join(basePath, ".gsd", "milestones", milestoneId), { recursive: true });
  writeFileSync(
    join(basePath, ".gsd", "milestones", milestoneId, `${milestoneId}-ROADMAP.md`),
    `# ${milestoneId}\n- [x] S01: Slice one\n`,
  );
  return wt;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("worktree journal events", () => {
  let tmp: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    resetRecentWorktreeMergeFailuresForTest();
    // realpathSync to match what `auto-worktree.ts` returns from
    // `resolveWorktreeProjectRoot` (macOS resolves `/var` → `/private/var`).
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "wt-journal-")));
  });
  afterEach(() => {
    // Restore cwd before cleanup — on Windows, rmSync fails with EPERM
    // if the process cwd is inside the directory being deleted.
    try { process.chdir(originalCwd); } catch { /* best-effort */ }
    rmSync(tmp, { recursive: true, force: true });
  });

  test("enterMilestone emits worktree-enter on success (new worktree)", () => {
    initGitRepoIn(tmp, "worktree");
    const s = makeSession({ basePath: tmp, originalBasePath: tmp });
    const result = new WorktreeLifecycle(s, makeDeps()).enterMilestone(
      "M001",
      makeNotifyCtx(),
    );
    assert.equal(
      result.ok,
      true,
      `enterMilestone failed: ${JSON.stringify(result)}`,
    );

    const entries = readJournalEntries(tmp);
    const enter = entries.find(e => e.eventType === "worktree-enter");
    assert.ok(enter, "worktree-enter event should be emitted");
    assert.equal(enter!.data?.milestoneId, "M001");
    assert.equal(enter!.data?.created, true);
    assert.ok(enter!.data?.wtPath);
  });

  test("enterMilestone emits worktree-enter with created=false for existing worktree", () => {
    // Pre-create the worktree on disk so the second enter goes through the
    // existing-worktree branch in `_enterMilestoneCore`.
    initGitRepoIn(tmp, "worktree");
    execFileSync("git", ["checkout", "-b", "milestone/M001"], { cwd: tmp, stdio: "pipe" });
    execFileSync("git", ["checkout", "main"], { cwd: tmp, stdio: "pipe" });
    execFileSync(
      "git",
      ["worktree", "add", join(tmp, ".gsd", "worktrees", "M001"), "milestone/M001"],
      { cwd: tmp, stdio: "pipe" },
    );

    const s = makeSession({ basePath: tmp, originalBasePath: tmp });
    new WorktreeLifecycle(s, makeDeps()).enterMilestone("M001", makeNotifyCtx());

    const entries = readJournalEntries(tmp);
    const enter = entries.find(e => e.eventType === "worktree-enter");
    assert.ok(enter, "worktree-enter event should be emitted");
    assert.equal(enter!.data?.created, false);
  });

  test("enterMilestone emits worktree-skip when isolation disabled", () => {
    initGitRepoIn(tmp, "none");
    const s = makeSession({ basePath: tmp, originalBasePath: tmp });
    new WorktreeLifecycle(s, makeDeps()).enterMilestone("M001", makeNotifyCtx());

    const entries = readJournalEntries(tmp);
    const skip = entries.find(e => e.eventType === "worktree-skip");
    assert.ok(skip, "worktree-skip event should be emitted");
    assert.equal(skip!.data?.milestoneId, "M001");
    assert.equal(skip!.data?.reason, "isolation-disabled");
  });

  test("enterMilestone emits worktree-create-failed on error", () => {
    // Real fixture with isolation:worktree, then delete .git to force the
    // real createAutoWorktree to throw.
    initGitRepoIn(tmp, "worktree");
    rmSync(join(tmp, ".git"), { recursive: true, force: true });
    const s = makeSession({ basePath: tmp, originalBasePath: tmp });
    new WorktreeLifecycle(s, makeDeps()).enterMilestone("M001", makeNotifyCtx());

    const entries = readJournalEntries(tmp);
    const failed = entries.find(e => e.eventType === "worktree-create-failed");
    assert.ok(failed, "worktree-create-failed event should be emitted");
    assert.equal(failed!.data?.milestoneId, "M001");
    assert.ok(failed!.data?.error, "error message should be present");
    assert.equal(failed!.data?.fallback, "project-root");
  });

  test("mergeAndExit emits worktree-merge-start", () => {
    initGitRepoIn(tmp, "worktree");
    execFileSync("git", ["checkout", "-b", "milestone/M001"], { cwd: tmp, stdio: "pipe" });
    execFileSync("git", ["checkout", "main"], { cwd: tmp, stdio: "pipe" });
    const wt = join(tmp, ".gsd", "worktrees", "M001");
    execFileSync("git", ["worktree", "add", wt, "milestone/M001"], { cwd: tmp, stdio: "pipe" });

    const s = makeSession({ basePath: wt, originalBasePath: tmp });
    const deps = makeDeps();
    process.chdir(wt);
    new WorktreeLifecycle(s, deps).exitMilestone(
      "M001",
      { merge: true },
      makeNotifyCtx(),
    );

    const entries = readJournalEntries(tmp);
    const start = entries.find(e => e.eventType === "worktree-merge-start");
    assert.ok(start, "worktree-merge-start event should be emitted");
    assert.equal(start!.data?.milestoneId, "M001");
    assert.equal(start!.data?.mode, "worktree");
  });

  test("exitMilestone propagates codeFilesChanged from merge result", () => {
    initGitRepoIn(tmp, "worktree");
    execFileSync("git", ["checkout", "-b", "milestone/M001"], { cwd: tmp, stdio: "pipe" });
    execFileSync("git", ["checkout", "main"], { cwd: tmp, stdio: "pipe" });
    const wt = join(tmp, ".gsd", "worktrees", "M001");
    execFileSync("git", ["worktree", "add", wt, "milestone/M001"], { cwd: tmp, stdio: "pipe" });
    mkdirSync(join(tmp, ".gsd", "milestones", "M001"), { recursive: true });
    writeFileSync(
      join(tmp, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# M001\n- [x] S01: Slice one\n",
    );

    const s = makeSession({ basePath: wt, originalBasePath: tmp });
    const deps = makeDeps({
      mergeMilestoneToMain: () => ({ pushed: false, codeFilesChanged: true }),
    });
    process.chdir(wt);

    const result = new WorktreeLifecycle(s, deps).exitMilestone(
      "M001",
      { merge: true },
      makeNotifyCtx(),
    );

    assert.deepEqual(result, {
      ok: true,
      merged: true,
      codeFilesChanged: true,
    });
  });

  test("mergeAndExit emits worktree-merge-failed on error", () => {
    const wt = setupMergeWorktree(tmp, "M001");
    const s = makeSession({ basePath: wt, originalBasePath: tmp });
    const deps = makeDeps({
      mergeMilestoneToMain: () => { throw new Error("conflict in main"); },
    });
    // Since #4380, mergeAndExit re-throws all errors after emitting the journal
    // event and restoring state. Lifecycle now wraps that throw in a typed
    // ExitResult — failure surfaces as ok:false / cause.
    const result = new WorktreeLifecycle(s, deps).exitMilestone(
      "M001",
      { merge: true },
      makeNotifyCtx(),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "teardown-failed");
      assert.match(
        result.cause instanceof Error
          ? result.cause.message
          : String(result.cause),
        /conflict in main/,
      );
    }

    new WorktreeLifecycle(s, deps).exitMilestone(
      "M001",
      { merge: true },
      makeNotifyCtx(),
    );

    const entries = readJournalEntries(tmp);
    const failures = entries.filter(e => e.eventType === "worktree-merge-failed");
    const failed = failures[0];
    assert.ok(failed, "worktree-merge-failed event should be emitted");
    assert.equal(failed!.data?.milestoneId, "M001");
    assert.equal(failed!.data?.error, "conflict in main");
    assert.equal(failures.length, 1, "duplicate merge failures are journaled once");
  });

  test("merge failure dedupe uses stable conflict category and expires", (t) => {
    let now = 1_000_000;
    t.mock.method(Date, "now", () => now);
    const wt = setupMergeWorktree(tmp, "M001");
    const s = makeSession({ basePath: wt, originalBasePath: tmp });
    let attempt = 0;
    const deps = makeDeps({
      mergeMilestoneToMain: () => {
        attempt += 1;
        throw new MergeConflictError(
          attempt === 1 ? ["src/a.ts"] : ["src/b.ts", "src/c.ts"],
          "squash",
          "milestone/M001",
          "main",
        );
      },
    });
    const lifecycle = new WorktreeLifecycle(s, deps);

    lifecycle.exitMilestone("M001", { merge: true }, makeNotifyCtx());
    lifecycle.exitMilestone("M001", { merge: true }, makeNotifyCtx());

    let failures = readJournalEntries(tmp).filter(e => e.eventType === "worktree-merge-failed");
    assert.equal(failures.length, 1, "variable conflict filenames should not bypass dedupe");
    assert.match(
      String(failures[0]!.data?.error),
      /src\/a\.ts/,
      "journal payload keeps the original error message",
    );

    now += 60_001;
    lifecycle.exitMilestone("M001", { merge: true }, makeNotifyCtx());

    failures = readJournalEntries(tmp).filter(e => e.eventType === "worktree-merge-failed");
    assert.equal(failures.length, 2, "same merge failure is journaled again after dedupe expiry");
  });

  test("journal entries have valid flowId, seq, and ts fields", () => {
    const s = makeSession({ basePath: tmp, originalBasePath: tmp });
    const deps = makeDeps({ shouldUseWorktreeIsolation: () => false });
    new WorktreeLifecycle(s, deps).enterMilestone("M001", makeNotifyCtx());

    const entries = readJournalEntries(tmp);
    assert.ok(entries.length > 0, "at least one entry should exist");
    const entry = entries[0];
    assert.ok(entry.flowId, "flowId should be set");
    assert.ok(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry.flowId),
      "flowId should be a valid UUID",
    );
    assert.equal(entry.seq, 0);
    assert.ok(entry.ts, "ts should be set");
    assert.ok(!isNaN(Date.parse(entry.ts)), "ts should be a valid ISO date");
  });
});
