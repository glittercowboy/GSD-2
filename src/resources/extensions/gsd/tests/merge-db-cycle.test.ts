import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { execFileSync } from "node:child_process";

import { mergeMilestoneToMain } from "../auto-worktree.ts";
import { closeDatabase, openDatabase } from "../gsd-db.ts";
import { GIT_NO_PROMPT_ENV } from "../git-constants.js";
import { _clearGsdRootCache } from "../paths.ts";
import { _resetServiceCache } from "../worktree.ts";
import { worktreePath } from "../worktree-manager.ts";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform });
  try {
    return fn();
  } finally {
    if (descriptor) {
      Object.defineProperty(process, "platform", descriptor);
    }
  }
}

function realGitPath(): string {
  const gitExecPath = execFileSync("git", ["--exec-path"], {
    encoding: "utf-8",
  }).trim();
  return join(gitExecPath, process.platform === "win32" ? "git.exe" : "git");
}

function installGitShim(bin: string, probePath: string): void {
  const shim = join(bin, "git-proxy.cjs");
  writeFileSync(
    shim,
    `
const { appendFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const realGit = ${JSON.stringify(realGitPath())};
const probePath = ${JSON.stringify(probePath)};
const args = process.argv.slice(2);

if (args[0] === "merge" && args[1] === "--squash") {
  const sidecars = [
    join(process.cwd(), ".gsd", "gsd.db-wal"),
    join(process.cwd(), ".gsd", "gsd.db-shm"),
  ];
  const locked = sidecars.find((path) => existsSync(path));
  if (locked) {
    appendFileSync(probePath, "blocked:" + locked + "\\n");
    console.error("error: local changes would be overwritten by merge");
    console.error("\\t" + locked);
    process.exit(1);
  }
  appendFileSync(probePath, "clean\\n");
}

const result = spawnSync(realGit, args, { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
`,
    "utf-8",
  );

  if (process.platform === "win32") {
    writeFileSync(join(bin, "git.cmd"), `@echo off\r\nnode "%~dp0git-proxy.cjs" %*\r\n`, "utf-8");
  } else {
    const executable = join(bin, "git");
    writeFileSync(executable, `#!/bin/sh\nexec node "${shim}" "$@"\n`, "utf-8");
    chmodSync(executable, 0o755);
  }
}

function createRepo(root: string): { repo: string; worktree: string } {
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  git(["init"], repo);
  git(["config", "user.email", "test@test.com"], repo);
  git(["config", "user.name", "Test"], repo);
  writeFileSync(join(repo, ".gitignore"), ".gsd/\n", "utf-8");
  writeFileSync(join(repo, "README.md"), "# test\n", "utf-8");
  git(["add", "."], repo);
  git(["commit", "-m", "init"], repo);
  git(["branch", "-M", "main"], repo);

  git(["checkout", "-b", "milestone/M001"], repo);
  writeFileSync(join(repo, "feature.txt"), "milestone change\n", "utf-8");
  mkdirSync(join(repo, ".gsd"), { recursive: true });
  writeFileSync(join(repo, ".gsd", "gsd.db-shm"), "milestone placeholder\n", "utf-8");
  git(["add", "feature.txt"], repo);
  git(["add", "-f", ".gsd/gsd.db-shm"], repo);
  git(["commit", "-m", "feat: milestone change"], repo);
  git(["checkout", "main"], repo);

  const wt = worktreePath(repo, "M001");
  mkdirSync(join(repo, ".gsd", "worktrees"), { recursive: true });
  git(["worktree", "add", wt, "milestone/M001"], repo);
  return { repo, worktree: wt };
}

test("mergeMilestoneToMain keeps the Windows DB cycle closed through squash merge", () => {
  const savedCwd = process.cwd();
  const originalPath = process.env.PATH ?? "";
  const gitEnv = GIT_NO_PROMPT_ENV as NodeJS.ProcessEnv;
  const originalGitEnvPath = gitEnv.PATH;
  const originalHome = process.env.HOME;
  const originalGsdHome = process.env.GSD_HOME;

  const root = realpathSync(mkdtempSync(join(tmpdir(), "gsd-db-cycle-")));
  const fakeHome = join(root, "home");
  const bin = join(root, "bin");
  const probePath = join(root, "merge-probe.txt");
  mkdirSync(fakeHome, { recursive: true });
  mkdirSync(bin, { recursive: true });
  installGitShim(bin, probePath);

  try {
    process.env.HOME = fakeHome;
    process.env.GSD_HOME = join(fakeHome, ".gsd");
    _clearGsdRootCache();
    _resetServiceCache();

    const { repo, worktree } = createRepo(root);
    mkdirSync(join(repo, ".gsd"), { recursive: true });

    withPlatform("win32", () => {
      assert.equal(openDatabase(join(repo, ".gsd", "gsd.db")), true);
      assert.equal(existsSync(join(repo, ".gsd", "gsd.db-shm")), true);

      process.env.PATH = `${bin}${delimiter}${originalPath}`;
      gitEnv.PATH = process.env.PATH;
      process.chdir(worktree);

      const result = mergeMilestoneToMain(repo, "M001", "# M001: Windows DB cycle\n");
      assert.equal(result.codeFilesChanged, true);
    });

    assert.equal(git(["show", "HEAD:feature.txt"], repo), "milestone change");
    assert.equal(readFileSync(probePath, "utf-8"), "clean\n");
  } finally {
    closeDatabase();
    process.chdir(savedCwd);
    process.env.PATH = originalPath;
    gitEnv.PATH = originalGitEnvPath;
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalGsdHome === undefined) {
      delete process.env.GSD_HOME;
    } else {
      process.env.GSD_HOME = originalGsdHome;
    }
    _clearGsdRootCache();
    _resetServiceCache();
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});
