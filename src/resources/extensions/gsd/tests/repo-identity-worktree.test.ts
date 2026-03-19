import { mkdtempSync, rmSync, writeFileSync, existsSync, lstatSync, readlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { repoIdentity, externalGsdRoot, ensureGsdSymlink } from "../repo-identity.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

async function main(): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), "gsd-repo-identity-"));
  const stateDir = mkdtempSync(join(tmpdir(), "gsd-state-"));

  try {
    process.env.GSD_STATE_DIR = stateDir;

    run("git init -b main", base);
    run('git config user.name "Pi Test"', base);
    run('git config user.email "pi@example.com"', base);
    run('git remote add origin git@github.com:example/repo.git', base);
    writeFileSync(join(base, "README.md"), "# Test Repo\n", "utf-8");
    run("git add README.md", base);
    run('git commit -m "chore: init"', base);

    const worktreePath = join(base, ".gsd", "worktrees", "M001");
    run(`git worktree add -b milestone/M001 ${worktreePath}`, base);

    console.log("\n=== repoIdentity stable across main repo and worktree ===");
    const mainHash = repoIdentity(base);
    const worktreeHash = repoIdentity(worktreePath);
    assertEq(worktreeHash, mainHash, "worktree hash matches main repo hash");

    console.log("\n=== externalGsdRoot stable across main repo and worktree ===");
    assertEq(externalGsdRoot(worktreePath), externalGsdRoot(base), "worktree external state dir matches main repo");

    console.log("\n=== ensureGsdSymlink points worktree at main repo external state dir ===");
    const expectedExternalState = externalGsdRoot(base);
    const worktreeState = ensureGsdSymlink(worktreePath);
    assertEq(worktreeState, expectedExternalState, "worktree symlink target matches main repo external state dir");
    assertTrue(existsSync(join(worktreePath, ".gsd")), "worktree .gsd exists");
    assertTrue(lstatSync(join(worktreePath, ".gsd")).isSymbolicLink(), "worktree .gsd is a symlink");
    assertEq(resolve(worktreePath, readlinkSync(join(worktreePath, ".gsd"))), expectedExternalState, "worktree .gsd symlink resolves to main repo external state dir");
  } finally {
    delete process.env.GSD_STATE_DIR;
    rmSync(base, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
    report();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
