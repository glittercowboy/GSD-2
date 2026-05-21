import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
/**
 * Regression tests for #1997: git locale not forced to C.
 *
 * Validates that GIT_NO_PROMPT_ENV includes LC_ALL=C so git always produces
 * English output, and that nativeMergeSquash passes the env to execFileSync.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { GIT_NO_PROMPT_ENV } from "../../git-constants.ts";
import { nativeAddAllWithExclusions, nativeMergeSquash } from "../../native-git-bridge.ts";
import { RUNTIME_EXCLUSION_PATHS } from "../../git-service.ts";
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function initTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-locale-"));
  git(dir, "init");
  git(dir, "config", "user.email", "test@test.com");
  git(dir, "config", "user.name", "Test");
  // Initial commit so HEAD exists
  writeFileSync(join(dir, "init.txt"), "init");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "init");
  return dir;
}

function createFile(base: string, relPath: string, content: string): void {
  const full = join(base, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

describe('git-locale', async () => {
  // ─── GIT_NO_PROMPT_ENV includes LC_ALL=C ─────────────────────────────


  assert.deepStrictEqual(
    GIT_NO_PROMPT_ENV.LC_ALL,
    "C",
    "GIT_NO_PROMPT_ENV must set LC_ALL to 'C' to force English git output"
  );

  assert.ok(
    "GIT_TERMINAL_PROMPT" in GIT_NO_PROMPT_ENV,
    "GIT_NO_PROMPT_ENV still contains GIT_TERMINAL_PROMPT"
  );

  // ─── nativeAddAllWithExclusions: non-English locale does not throw ───

  test('nativeAddAllWithExclusions: non-English locale does not throw', () => {
    // Simulate what happens on a German system: .gsd is gitignored,
    // exclusion pathspecs trigger an advisory warning exit code 1.
    // With LC_ALL=C the English stderr guard should match and suppress.
    const repo = initTempRepo();

    writeFileSync(join(repo, ".gitignore"), ".gsd\n");
    createFile(repo, ".gsd/STATE.md", "# State");
    createFile(repo, "src/app.ts", "export const x = 1;");

    // Save original LC_ALL / LANG and force German locale env
    const origLcAll = process.env.LC_ALL;
    const origLang = process.env.LANG;
    process.env.LANG = "de_DE.UTF-8";
    delete process.env.LC_ALL;

    let threw = false;
    try {
      nativeAddAllWithExclusions(repo, RUNTIME_EXCLUSION_PATHS);
    } catch (e) {
      threw = true;
      console.error("  unexpected error:", e);
    }

    // Restore
    if (origLcAll !== undefined) process.env.LC_ALL = origLcAll;
    else delete process.env.LC_ALL;
    if (origLang !== undefined) process.env.LANG = origLang;
    else delete process.env.LANG;

    assert.ok(
      !threw,
      "nativeAddAllWithExclusions must not throw on non-English locale when .gsd is gitignored (#1997)"
    );

    const staged = git(repo, "diff", "--cached", "--name-only");
    assert.ok(staged.includes("src/app.ts"), "real file staged despite German locale");

    rmSync(repo, { recursive: true, force: true });
  });

  // ─── nativeMergeSquash: env is passed (merge-squash stderr is English) ─

  test('nativeMergeSquash succeeds under non-English locale env', () => {
    const repo = initTempRepo();
    try {
      const mainBranch = git(repo, "branch", "--show-current");
      git(repo, "checkout", "-b", "feature");
      createFile(repo, "src/feature.ts", "export const feature = true;");
      git(repo, "add", "-A");
      git(repo, "commit", "-m", "feat: add feature");
      git(repo, "checkout", mainBranch);

      const origLcAll = process.env.LC_ALL;
      const origLang = process.env.LANG;
      process.env.LANG = "de_DE.UTF-8";
      delete process.env.LC_ALL;
      try {
        const result = nativeMergeSquash(repo, "feature");
        assert.equal(result.success, true);
      } finally {
        if (origLcAll !== undefined) process.env.LC_ALL = origLcAll;
        else delete process.env.LC_ALL;
        if (origLang !== undefined) process.env.LANG = origLang;
        else delete process.env.LANG;
      }

      const staged = git(repo, "diff", "--cached", "--name-only");
      assert.ok(staged.includes("src/feature.ts"));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
