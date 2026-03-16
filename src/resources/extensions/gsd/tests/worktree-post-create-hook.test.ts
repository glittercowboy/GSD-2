/**
 * worktree-post-create-hook.test.ts — Tests for #597 worktree post-create hook.
 *
 * Verifies that runWorktreePostCreateHook correctly executes user scripts
 * with SOURCE_DIR and WORKTREE_DIR environment variables.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runWorktreePostCreateHook } from "../auto-worktree.ts";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "gsd-wt-hook-test-"));
}

// ─── runWorktreePostCreateHook ──────────────────────────────────────────────

test("returns null when no hook path is provided", () => {
  const src = makeTmpDir();
  const wt = makeTmpDir();
  try {
    const result = runWorktreePostCreateHook(src, wt, undefined);
    assert.equal(result, null);
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("returns error when hook script does not exist", () => {
  const src = makeTmpDir();
  const wt = makeTmpDir();
  try {
    const result = runWorktreePostCreateHook(src, wt, ".gsd/hooks/nonexistent");
    assert.ok(result !== null, "should return error string");
    assert.ok(result!.includes("not found"), "error should mention 'not found'");
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("executes hook script with correct SOURCE_DIR and WORKTREE_DIR env vars", () => {
  const src = makeTmpDir();
  const wt = makeTmpDir();
  try {
    const hooksDir = join(src, ".gsd", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    const hookScript = join(hooksDir, "post-create");
    writeFileSync(hookScript, `#!/bin/bash
echo "SOURCE=$SOURCE_DIR" > "$WORKTREE_DIR/hook-output.txt"
echo "WORKTREE=$WORKTREE_DIR" >> "$WORKTREE_DIR/hook-output.txt"
`);
    chmodSync(hookScript, 0o755);

    const result = runWorktreePostCreateHook(src, wt, ".gsd/hooks/post-create");
    assert.equal(result, null, "should succeed");

    const outputFile = join(wt, "hook-output.txt");
    assert.ok(existsSync(outputFile), "hook should have created output file");

    const output = readFileSync(outputFile, "utf-8");
    assert.ok(output.includes(`SOURCE=${src}`), "SOURCE_DIR should match source dir");
    assert.ok(output.includes(`WORKTREE=${wt}`), "WORKTREE_DIR should match worktree dir");
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("returns error message when hook script fails", () => {
  const src = makeTmpDir();
  const wt = makeTmpDir();
  try {
    const hooksDir = join(src, ".gsd", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    const hookScript = join(hooksDir, "failing-hook");
    writeFileSync(hookScript, `#!/bin/bash
echo "error" >&2
exit 1
`);
    chmodSync(hookScript, 0o755);

    const result = runWorktreePostCreateHook(src, wt, ".gsd/hooks/failing-hook");
    assert.ok(result !== null, "should return error string");
    assert.ok(result!.includes("hook failed"), "error should mention 'hook failed'");
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("supports absolute hook paths", () => {
  const src = makeTmpDir();
  const wt = makeTmpDir();
  try {
    const hookScript = join(src, "absolute-hook.sh");
    writeFileSync(hookScript, `#!/bin/bash
touch "$WORKTREE_DIR/absolute-hook-ran"
`);
    chmodSync(hookScript, 0o755);

    const result = runWorktreePostCreateHook(src, wt, hookScript);
    assert.equal(result, null, "absolute path hook should succeed");
    assert.ok(existsSync(join(wt, "absolute-hook-ran")), "hook should have run");
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("hook can copy files from source to worktree", () => {
  const src = makeTmpDir();
  const wt = makeTmpDir();
  try {
    // Create a .env file in source
    writeFileSync(join(src, ".env"), "DB_HOST=localhost\nAPI_KEY=secret123\n");

    // Create hook that copies .env
    const hookScript = join(src, "setup-hook.sh");
    writeFileSync(hookScript, `#!/bin/bash
cp "$SOURCE_DIR/.env" "$WORKTREE_DIR/.env"
`);
    chmodSync(hookScript, 0o755);

    const result = runWorktreePostCreateHook(src, wt, hookScript);
    assert.equal(result, null, "hook should succeed");

    // Verify .env was copied
    assert.ok(existsSync(join(wt, ".env")), ".env should be copied to worktree");
    const envContent = readFileSync(join(wt, ".env"), "utf-8");
    assert.ok(envContent.includes("API_KEY=secret123"), ".env content should match");
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});
