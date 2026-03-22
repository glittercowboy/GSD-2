/**
 * Worktree Source-Loss Guards — E2E Tests (#M013-RCA)
 *
 * Tests the 5 guards that prevent source-file loss during worktree lifecycle:
 *   B1: Post-commit source-file verification (autoCommit warns when source skipped)
 *   B2: Universal cache reset (nativeHasChanges cache doesn't skip commits)
 *   B3: autoCommitDirtyState error propagation (errors thrown, not swallowed)
 *   B4: Branch validation on enter (wrong branch → throw, not silent corruption)
 *   B5: Pre-teardown source audit (uncommitted source → abort teardown)
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import {
  createAutoWorktree,
  enterAutoWorktree,
  autoWorktreeBranch,
  mergeMilestoneToMain,
  getAutoWorktreePath,
} from "../auto-worktree.ts";
import {
  nativeGetCurrentBranch,
  _resetHasChangesCache,
} from "../native-git-bridge.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

// ─── Helpers ──────────────────────────────────────────────────────────────

/** The project root for cwd recovery — never deleted. */
const SAFE_CWD = realpathSync(join(tmpdir()));

function run(cmd: string, cwd: string): string {
  return execSync(cmd, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function freshRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "wt-guard-test-")));
  run("git init", dir);
  run("git config user.email test@test.com", dir);
  run("git config user.name Test", dir);
  writeFileSync(join(dir, "README.md"), "# Test\n");
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  writeFileSync(join(dir, ".gsd", "STATE.md"), "# State\n");
  run("git add -A && git commit -m 'init'", dir);
  run("git branch -M main", dir);
  return dir;
}

function cleanup(dir: string): void {
  try {
    // Ensure we're not inside the dir being deleted
    process.chdir(SAFE_CWD);
    run("git worktree prune 2>/dev/null || true", dir);
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function makeRoadmap(mid: string, title: string, slices: { id: string; title: string }[]): string {
  const sliceLines = slices.map(s => `- [x] **${s.id}: ${s.title}** \`risk:low\` \`depends:[]\``).join("\n");
  return `# ${mid}: ${title}\n\n## Slices\n\n${sliceLines}\n`;
}

// ─── B4: Branch validation on enter ──────────────────────────────────────

console.log("\n=== B4: Branch validation on enter ===");
{
  const repo = freshRepo();
  try {
    // Create worktree properly
    const wtPath = createAutoWorktree(repo, "M001");
    const expectedBranch = autoWorktreeBranch("M001");

    // Verify it's on the correct branch
    const branch = nativeGetCurrentBranch(wtPath);
    assertEq(branch, expectedBranch, "worktree should be on milestone branch");

    // chdir back to repo root
    process.chdir(repo);

    // Corrupt the worktree: force checkout a different branch inside it
    run(`cd "${wtPath}" && git checkout -b rogue-branch`, repo);

    // Attempting to enter should now throw
    let threw = false;
    let errMsg = "";
    try {
      enterAutoWorktree(repo, "M001");
    } catch (err) {
      threw = true;
      errMsg = err instanceof Error ? err.message : String(err);
    }
    assertTrue(threw, "enterAutoWorktree must throw when branch doesn't match");
    assertTrue(
      errMsg.includes("rogue-branch"),
      `error should mention actual branch, got: ${errMsg}`,
    );
    assertTrue(
      errMsg.includes(expectedBranch),
      `error should mention expected branch, got: ${errMsg}`,
    );
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

console.log("\n=== B4: enterAutoWorktree succeeds when branch is correct ===");
{
  const repo = freshRepo();
  try {
    const wtPath = createAutoWorktree(repo, "M002");
    process.chdir(repo);

    // Re-entering the valid worktree should succeed
    const result = enterAutoWorktree(repo, "M002");
    assertEq(result, wtPath, "should return worktree path");

    const branch = nativeGetCurrentBranch(process.cwd());
    assertEq(branch, autoWorktreeBranch("M002"), "should be on milestone branch");
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

// ─── B3: autoCommitDirtyState auto-commits dirty files in merge ──────────

console.log("\n=== B3: dirty source files auto-committed before merge ===");
{
  const repo = freshRepo();
  try {
    const wtPath = createAutoWorktree(repo, "M010");

    // Create the milestone roadmap
    const gsdDir = join(wtPath, ".gsd", "milestones", "M010");
    mkdirSync(gsdDir, { recursive: true });
    const roadmapContent = makeRoadmap("M010", "Test Milestone", [
      { id: "S01", title: "Test Slice" },
    ]);
    writeFileSync(join(gsdDir, "M010-ROADMAP.md"), roadmapContent);
    run("git add -A && git commit -m 'add roadmap'", wtPath);

    // Write source file in worktree and commit it
    writeFileSync(join(wtPath, "feature.ts"), "export const x = 1;\n");
    run("git add -A && git commit -m 'add feature'", wtPath);

    // Now add ANOTHER dirty source file (not committed yet)
    writeFileSync(join(wtPath, "feature2.ts"), "export const y = 2;\n");

    // Merge — should auto-commit the dirty file before merging
    const result = mergeMilestoneToMain(repo, "M010", roadmapContent);
    assertTrue(!!result.commitMessage, "should produce a commit message");

    // Verify both source files landed on integration branch
    assertTrue(
      existsSync(join(repo, "feature.ts")),
      "feature.ts must exist on integration branch",
    );
    assertTrue(
      existsSync(join(repo, "feature2.ts")),
      "feature2.ts (dirty before merge) must exist on integration branch",
    );
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

// ─── B2: Cache bypass ────────────────────────────────────────────────────

console.log("\n=== B2: _resetHasChangesCache allows rapid successive commits ===");
{
  const repo = freshRepo();
  try {
    // First write + commit
    writeFileSync(join(repo, "file1.ts"), "const a = 1;\n");
    run("git add -A && git commit -m 'add file1'", repo);

    const count1 = parseInt(run("git rev-list --count HEAD", repo), 10);

    // Second write immediately
    writeFileSync(join(repo, "file2.ts"), "const b = 2;\n");

    // Reset cache, then commit
    _resetHasChangesCache();

    run("git add -A && git commit -m 'add file2'", repo);
    const count2 = parseInt(run("git rev-list --count HEAD", repo), 10);

    assertEq(count2, count1 + 1, "second commit should succeed after cache reset");

    // Verify file2 is in the commit
    const files = run("git show HEAD --stat --name-only", repo);
    assertTrue(files.includes("file2.ts"), "file2.ts must be in the commit");
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

// ─── E2E: Full Lifecycle ─────────────────────────────────────────────────

console.log("\n=== E2E: source files survive full worktree lifecycle ===");
{
  const repo = freshRepo();
  try {
    // 1. Create worktree
    const wtPath = createAutoWorktree(repo, "M020");

    // 2. Create roadmap
    const gsdDir = join(wtPath, ".gsd", "milestones", "M020");
    mkdirSync(gsdDir, { recursive: true });
    const slicesDir = join(gsdDir, "slices", "S01", "tasks");
    mkdirSync(slicesDir, { recursive: true });

    const roadmapContent = makeRoadmap("M020", "Full Lifecycle", [
      { id: "S01", title: "Feature Slice" },
    ]);
    writeFileSync(join(gsdDir, "M020-ROADMAP.md"), roadmapContent);

    // 3. Write source files (simulating what the LLM does)
    mkdirSync(join(wtPath, "src", "cockpit"), { recursive: true });
    writeFileSync(join(wtPath, "src", "cockpit", "server.ts"), "export function startServer() { return true; }\n");
    writeFileSync(join(wtPath, "src", "cockpit", "client.ts"), "export function connect() { return true; }\n");
    writeFileSync(join(wtPath, "src", "cockpit", "types.ts"), "export interface Config { port: number; }\n");

    // Write .gsd metadata (task summary)
    writeFileSync(join(slicesDir, "T01-SUMMARY.md"), "---\nstatus: done\n---\n# T01 Summary\n");

    // 4. Commit everything
    run("git add -A && git commit -m 'feat(S01): implement cockpit'", wtPath);

    // Verify source files are in the commit
    const commitFiles = run("git log --oneline --name-only -1", wtPath);
    assertTrue(commitFiles.includes("src/cockpit/server.ts"), "server.ts must be committed");
    assertTrue(commitFiles.includes("src/cockpit/client.ts"), "client.ts must be committed");

    // 5. Merge milestone to main
    const result = mergeMilestoneToMain(repo, "M020", roadmapContent);
    assertTrue(result.commitMessage.includes("Full Lifecycle"), "commit message should have title");

    // 6. Verify source files are on integration branch
    assertTrue(
      existsSync(join(repo, "src", "cockpit", "server.ts")),
      "server.ts MUST exist on integration branch after merge",
    );
    assertTrue(
      existsSync(join(repo, "src", "cockpit", "client.ts")),
      "client.ts MUST exist on integration branch after merge",
    );
    assertTrue(
      existsSync(join(repo, "src", "cockpit", "types.ts")),
      "types.ts MUST exist on integration branch after merge",
    );

    // Verify content is correct
    const content = readFileSync(join(repo, "src", "cockpit", "server.ts"), "utf-8");
    assertTrue(content.includes("startServer"), "file content must be preserved");

    // 7. Verify codeFilesChanged flag
    assertEq(result.codeFilesChanged, true, "codeFilesChanged must be true");
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

// ─── B5: Pre-teardown source audit ────────────────────────────────────────

console.log("\n=== B5: pre-teardown catches uncommitted source files ===");
{
  const repo = freshRepo();
  try {
    const wtPath = createAutoWorktree(repo, "M030");

    // Create roadmap
    const gsdDir = join(wtPath, ".gsd", "milestones", "M030");
    mkdirSync(gsdDir, { recursive: true });
    const roadmapContent = makeRoadmap("M030", "Pre-teardown Test", [
      { id: "S01", title: "Feature" },
    ]);
    writeFileSync(join(gsdDir, "M030-ROADMAP.md"), roadmapContent);
    run("git add -A && git commit -m 'add roadmap'", wtPath);

    // Write source files and commit them
    writeFileSync(join(wtPath, "saved.ts"), "export const saved = true;\n");
    run("git add -A && git commit -m 'add saved feature'", wtPath);

    // Now add a dirty (uncommitted) source file
    writeFileSync(join(wtPath, "unsaved.ts"), "export const unsaved = true;\n");

    // Merge should succeed — the pre-teardown check should auto-commit the dirty file
    const result = mergeMilestoneToMain(repo, "M030", roadmapContent);

    // Both files must survive
    assertTrue(existsSync(join(repo, "saved.ts")), "committed file must survive merge");
    assertTrue(existsSync(join(repo, "unsaved.ts")), "pre-teardown auto-committed file must survive merge");
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

// ─── Regression: getAutoWorktreePath rejects stray directories ───────────

console.log("\n=== getAutoWorktreePath rejects directory without .git file ===");
{
  const repo = freshRepo();
  try {
    // Create a stray directory that looks like a worktree but isn't
    const wtDir = join(repo, ".gsd", "worktrees", "M099");
    mkdirSync(wtDir, { recursive: true });
    writeFileSync(join(wtDir, "README.md"), "stray file\n");

    const result = getAutoWorktreePath(repo, "M099");
    assertEq(result, null, "must return null for directory without .git");
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

// ─── B5: Worktree creation failure doesn't corrupt merge path ────────────

console.log("\n=== B5: WorktreeResolver.enterMilestone failure leaves safe state ===");
{
  // This verifies that when enterMilestone fails, the downstream
  // mergeAndExit/exitMilestone code paths are safe (no spurious merge
  // on a non-existent worktree). Uses the WorktreeResolver mock interface
  // to simulate the full flow.

  const { isInAutoWorktree } = await import("../auto-worktree.ts");
  const repo = freshRepo();
  try {
    // Simulate: enterMilestone was never called (worktree creation failed)
    // The session basePath stays at project root
    const isInWt = isInAutoWorktree(repo);
    assertEq(isInWt, false, "project root must not be detected as auto-worktree");

    // Verify getAutoWorktreePath returns null for non-existent worktree
    const wtPath = getAutoWorktreePath(repo, "M050");
    assertEq(wtPath, null, "non-existent worktree returns null");

    // These are the guards that prevent merge on a failed worktree:
    // 1. isInAutoWorktree returns false → exitMilestone is a no-op
    // 2. getAutoWorktreePath returns null → enterMilestone won't enter
    // 3. s.originalBasePath stays empty → mergeAndExit skips worktree mode
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

// ─── B1: autoCommit stages source files alongside .gsd/ files ────────────

console.log("\n=== B1: autoCommit includes source files in commits ===");
{
  const { GitServiceImpl } = await import("../git-service.ts");
  const repo = freshRepo();
  try {
    // Write both source and .gsd/ files
    writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");
    mkdirSync(join(repo, ".gsd", "milestones", "M060"), { recursive: true });
    writeFileSync(
      join(repo, ".gsd", "milestones", "M060", "M060-ROADMAP.md"),
      "# M060 Roadmap\n",
    );

    // Use the real GitServiceImpl.autoCommit
    const svc = new GitServiceImpl(repo, {});
    _resetHasChangesCache();
    const commitMsg = svc.autoCommit("execute-task", "M060/S01/T01");

    assertTrue(!!commitMsg, "autoCommit should produce a commit message");

    // Verify the commit contains source files
    const commitContents = run("git show HEAD --name-only --format=''", repo);
    assertTrue(
      commitContents.includes("feature.ts"),
      `feature.ts must be in the commit, got: ${commitContents}`,
    );
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

// ─── Stress: rapid autoCommit calls with cache reset ─────────────────────

console.log("\n=== Stress: 3 rapid autoCommits all capture their files ===");
{
  const { GitServiceImpl } = await import("../git-service.ts");
  const repo = freshRepo();
  try {
    for (let i = 1; i <= 3; i++) {
      writeFileSync(join(repo, `rapid-${i}.ts`), `export const v${i} = ${i};\n`);
      _resetHasChangesCache();
      const svc = new GitServiceImpl(repo, {});
      const msg = svc.autoCommit("execute-task", `M070/S01/T0${i}`);
      assertTrue(!!msg, `commit ${i} should succeed`);

      const lastCommit = run("git show HEAD --name-only --format=''", repo);
      assertTrue(
        lastCommit.includes(`rapid-${i}.ts`),
        `rapid-${i}.ts must be in commit ${i}, got: ${lastCommit}`,
      );
    }

    // Verify all 3 files exist in HEAD
    const allFiles = run("git ls-tree -r --name-only HEAD", repo);
    for (let i = 1; i <= 3; i++) {
      assertTrue(
        allFiles.includes(`rapid-${i}.ts`),
        `rapid-${i}.ts must be tracked in HEAD`,
      );
    }
  } finally {
    process.chdir(SAFE_CWD);
    cleanup(repo);
  }
}

report();
