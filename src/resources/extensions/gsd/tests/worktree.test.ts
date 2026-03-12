import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  autoCommitCurrentBranch,
  detectWorktreeName,
  ensureSliceBranch,
  getActiveSliceBranch,
  getCurrentBranch,
  getSliceBranchName,
  isOnSliceBranch,
  mergeSliceToMain,
  parseSliceBranch,
  SLICE_BRANCH_RE,
  switchToMain,
} from "../worktree.ts";
import { deriveState } from "../state.ts";
import { indexWorkspace } from "../workspace-index.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

const base = mkdtempSync(join(tmpdir(), "gsd-branch-test-"));
run("git init -b main", base);
run("git config user.name 'Pi Test'", base);
run("git config user.email 'pi@example.com'", base);
mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
writeFileSync(join(base, "README.md"), "hello\n", "utf-8");
writeFileSync(join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"), `# M001: Demo\n\n## Slices\n- [ ] **S01: Slice One** \`risk:low\` \`depends:[]\`\n  > After this: demo works\n`, "utf-8");
writeFileSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"), `# S01: Slice One\n\n**Goal:** Demo\n**Demo:** Demo\n\n## Must-Haves\n- done\n\n## Tasks\n- [ ] **T01: Implement** \`est:10m\`\n  do it\n`, "utf-8");
run("git add .", base);
run("git commit -m 'chore: init'", base);

async function main(): Promise<void> {
  console.log("\n=== ensureSliceBranch ===");
  const created = ensureSliceBranch(base, "M001", "S01");
  assert(created, "branch created on first ensure");
  assertEq(getCurrentBranch(base), "gsd/M001/S01", "switched to slice branch");

  console.log("\n=== idempotent ensure ===");
  const secondCreate = ensureSliceBranch(base, "M001", "S01");
  assertEq(secondCreate, false, "branch not recreated on second ensure");
  assertEq(getCurrentBranch(base), "gsd/M001/S01", "still on slice branch");

  console.log("\n=== getActiveSliceBranch ===");
  assertEq(getActiveSliceBranch(base), "gsd/M001/S01", "getActiveSliceBranch returns current slice branch");

  console.log("\n=== state surfaces active branch ===");
  const state = await deriveState(base);
  assertEq(state.activeBranch, "gsd/M001/S01", "state exposes active branch");

  console.log("\n=== workspace index surfaces branch ===");
  const index = await indexWorkspace(base);
  const slice = index.milestones[0]?.slices[0];
  assertEq(slice?.branch, "gsd/M001/S01", "workspace index exposes branch");

  console.log("\n=== autoCommitCurrentBranch ===");
  // Clean — should return null
  const cleanResult = autoCommitCurrentBranch(base, "execute-task", "M001/S01/T01");
  assertEq(cleanResult, null, "returns null for clean repo");

  // Make dirty
  writeFileSync(join(base, "dirty.txt"), "uncommitted\n", "utf-8");
  const dirtyResult = autoCommitCurrentBranch(base, "execute-task", "M001/S01/T01");
  assert(dirtyResult !== null, "returns commit message for dirty repo");
  assert(dirtyResult!.includes("M001/S01/T01"), "commit message includes unit id");
  assertEq(run("git status --short", base), "", "repo is clean after auto-commit");

  console.log("\n=== switchToMain ===");
  switchToMain(base);
  assertEq(getCurrentBranch(base), "main", "switched back to main");
  assertEq(getActiveSliceBranch(base), null, "getActiveSliceBranch returns null on main");

  console.log("\n=== mergeSliceToMain ===");
  // Switch back to slice, make a change, switch to main, merge
  ensureSliceBranch(base, "M001", "S01");
  writeFileSync(join(base, "README.md"), "hello from slice\n", "utf-8");
  run("git add README.md", base);
  run("git commit -m 'feat: slice change'", base);
  switchToMain(base);

  const merge = mergeSliceToMain(base, "M001", "S01", "Slice One");
  assertEq(merge.branch, "gsd/M001/S01", "merge reports branch");
  assertEq(getCurrentBranch(base), "main", "still on main after merge");
  assert(readFileSync(join(base, "README.md"), "utf-8").includes("slice"), "main got squashed content");
  assert(merge.deletedBranch, "branch was deleted");

  // Verify branch is actually gone
  const branches = run("git branch", base);
  assert(!branches.includes("gsd/M001/S01"), "slice branch no longer exists");

  console.log("\n=== switchToMain auto-commits dirty files ===");
  // Set up S02
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S02", "tasks"), { recursive: true });
  writeFileSync(join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"), [
    "# M001: Demo", "", "## Slices",
    "- [x] **S01: Slice One** `risk:low` `depends:[]`", "  > Done",
    "- [ ] **S02: Slice Two** `risk:low` `depends:[]`", "  > Demo 2",
  ].join("\n") + "\n", "utf-8");
  run("git add .", base);
  run("git commit -m 'chore: add S02'", base);

  ensureSliceBranch(base, "M001", "S02");
  writeFileSync(join(base, "feature.txt"), "new feature\n", "utf-8");
  // Don't commit — switchToMain should auto-commit
  switchToMain(base);
  assertEq(getCurrentBranch(base), "main", "switched to main despite dirty files");

  // Verify the commit happened on the slice branch
  ensureSliceBranch(base, "M001", "S02");
  assert(readFileSync(join(base, "feature.txt"), "utf-8").includes("new feature"), "dirty file was committed on slice branch");
  switchToMain(base);

  // Now merge S02
  const mergeS02 = mergeSliceToMain(base, "M001", "S02", "Slice Two");
  assert(readFileSync(join(base, "feature.txt"), "utf-8").includes("new feature"), "main got feature from auto-committed branch");
  assertEq(mergeS02.deletedBranch, true, "S02 branch deleted");

  console.log("\n=== getSliceBranchName ===");
  assertEq(getSliceBranchName("M001", "S01"), "gsd/M001/S01", "branch name format correct");
  assertEq(getSliceBranchName("M001", "S01", null), "gsd/M001/S01", "null worktree = plain branch");
  assertEq(getSliceBranchName("M001", "S01", "my-wt"), "gsd/my-wt/M001/S01", "worktree-namespaced branch");

  console.log("\n=== parseSliceBranch ===");
  const plain = parseSliceBranch("gsd/M001/S01");
  assert(plain !== null, "parses plain branch");
  assertEq(plain!.worktreeName, null, "plain branch has no worktree name");
  assertEq(plain!.milestoneId, "M001", "plain branch milestone");
  assertEq(plain!.sliceId, "S01", "plain branch slice");

  const namespaced = parseSliceBranch("gsd/feature-auth/M001/S01");
  assert(namespaced !== null, "parses worktree-namespaced branch");
  assertEq(namespaced!.worktreeName, "feature-auth", "worktree name extracted");
  assertEq(namespaced!.milestoneId, "M001", "namespaced branch milestone");
  assertEq(namespaced!.sliceId, "S01", "namespaced branch slice");

  const invalid = parseSliceBranch("main");
  assertEq(invalid, null, "non-slice branch returns null");

  const worktreeBranch = parseSliceBranch("worktree/foo");
  assertEq(worktreeBranch, null, "worktree/ prefix is not a slice branch");

  console.log("\n=== SLICE_BRANCH_RE ===");
  assert(SLICE_BRANCH_RE.test("gsd/M001/S01"), "regex matches plain branch");
  assert(SLICE_BRANCH_RE.test("gsd/my-wt/M001/S01"), "regex matches worktree branch");
  assert(!SLICE_BRANCH_RE.test("main"), "regex rejects main");
  assert(!SLICE_BRANCH_RE.test("gsd/"), "regex rejects bare gsd/");
  assert(!SLICE_BRANCH_RE.test("worktree/foo"), "regex rejects worktree/foo");

  console.log("\n=== detectWorktreeName ===");
  assertEq(detectWorktreeName("/projects/myapp"), null, "no worktree in plain path");
  assertEq(detectWorktreeName("/projects/myapp/.gsd/worktrees/feature-auth"), "feature-auth", "detects worktree name");
  assertEq(detectWorktreeName("/projects/myapp/.gsd/worktrees/my-wt/subdir"), "my-wt", "detects worktree with subdir");

  rmSync(base, { recursive: true, force: true });
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All tests passed ✓");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
