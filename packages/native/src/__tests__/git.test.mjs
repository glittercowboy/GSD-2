import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";

// These tests require the native addon to be built.
// Run: cd native && npm run build
let native;
try {
  const mod = await import("../native.js");
  native = mod.native;
} catch {
  console.log("Native addon not built — skipping git tests.");
  process.exit(0);
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "gsd-git-test-"));
  execSync("git init", { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  return dir;
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

// Test: gitCurrentBranch
{
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "hello");
    execSync("git add a.txt", { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir });
    const branch = native.gitCurrentBranch(dir);
    assert.ok(typeof branch === "string" && branch.length > 0, "branch should be a non-empty string");
    console.log("✓ gitCurrentBranch:", branch);
  } finally {
    cleanup(dir);
  }
}

// Test: gitIsClean
{
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "hello");
    execSync("git add a.txt", { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir });
    const clean = native.gitIsClean(dir);
    assert.equal(clean, true, "repo should be clean after commit");
    writeFileSync(join(dir, "b.txt"), "dirty");
    const dirty = native.gitIsClean(dir);
    assert.equal(dirty, false, "repo should be dirty with untracked file");
    console.log("✓ gitIsClean");
  } finally {
    cleanup(dir);
  }
}

// Test: gitStatus
{
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "hello");
    execSync("git add a.txt", { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir });
    writeFileSync(join(dir, "b.txt"), "untracked");
    writeFileSync(join(dir, "a.txt"), "modified");
    execSync("git add a.txt", { cwd: dir });
    const status = native.gitStatus(dir);
    assert.ok(Array.isArray(status.staged), "staged should be array");
    assert.ok(Array.isArray(status.unstaged), "unstaged should be array");
    assert.ok(Array.isArray(status.untracked), "untracked should be array");
    assert.ok(status.staged.includes("a.txt"), "a.txt should be staged");
    assert.ok(status.untracked.includes("b.txt"), "b.txt should be untracked");
    console.log("✓ gitStatus");
  } finally {
    cleanup(dir);
  }
}

// Test: gitLog
{
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "hello");
    execSync("git add a.txt", { cwd: dir });
    execSync('git commit -m "first commit"', { cwd: dir });
    const log = native.gitLog(dir, 10);
    assert.ok(Array.isArray(log), "log should be array");
    assert.ok(log.length >= 1, "should have at least one entry");
    const entry = log[0];
    assert.ok(typeof entry.hash === "string" && entry.hash.length === 40, "hash should be 40 chars");
    assert.ok(typeof entry.shortHash === "string" && entry.shortHash.length === 8, "shortHash should be 8 chars");
    assert.ok(entry.message.includes("first commit"), "message mismatch");
    console.log("✓ gitLog");
  } finally {
    cleanup(dir);
  }
}

// Test: gitStageFiles + gitCommit
{
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "hello");
    execSync("git add a.txt", { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir });
    writeFileSync(join(dir, "c.txt"), "new file");
    native.gitStageFiles(dir, ["c.txt"]);
    const oid = native.gitCommit(dir, "add c.txt", "Test", "test@test.com");
    assert.ok(typeof oid === "string" && oid.length === 40, "commit oid should be 40 chars");
    const log = native.gitLog(dir, 1);
    assert.ok(log[0].message.includes("add c.txt"), "commit message mismatch");
    console.log("✓ gitStageFiles + gitCommit");
  } finally {
    cleanup(dir);
  }
}

// Test: gitDiff
{
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "line1\n");
    execSync("git add a.txt", { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir });
    writeFileSync(join(dir, "a.txt"), "line1\nline2\n");
    const diff = native.gitDiff(dir, false);
    assert.ok(typeof diff === "string", "diff should be string");
    assert.ok(diff.includes("line2"), "diff should mention new content");
    console.log("✓ gitDiff (unstaged)");
  } finally {
    cleanup(dir);
  }
}

console.log("\nAll git tests passed.");
