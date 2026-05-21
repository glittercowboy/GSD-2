// GSD-2 - /gsd migrate safety helpers.
// File Purpose: Path resolution, target guards, backup, and restore support for v1 migration.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

import { ensureDbOpen } from "../bootstrap/dynamic-tools.js";
import { readCrashLock, isLockProcessAlive } from "../crash-recovery.js";
import { closeDatabase } from "../gsd-db.js";
import { readPausedSessionMetadata } from "../interrupted-session.js";
import { gsdRoot } from "../paths.js";
import type { MigrationPreview } from "./writer.js";

export interface MigrationPaths {
  sourcePath: string;
  targetRoot: string;
}

export interface MigrationBackup {
  hadExistingGsd: boolean;
  backupPath: string | null;
  targetGsdPath: string;
}

export class MigrationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationBlockedError";
  }
}

function expandHome(pathArg: string): string {
  if (pathArg === "~") return homedir();
  if (pathArg.startsWith("~/")) return join(homedir(), pathArg.slice(2));
  return pathArg;
}

export function resolveMigrationPaths(args: string, cwd: string = process.cwd()): MigrationPaths {
  const rawPath = expandHome(args.trim() || ".");
  const resolved = resolve(cwd, rawPath);

  if (basename(resolved) === ".planning") {
    return {
      sourcePath: resolved,
      targetRoot: dirname(resolved),
    };
  }

  return {
    sourcePath: join(resolved, ".planning"),
    targetRoot: resolved,
  };
}

function formatBackupTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function nextBackupPath(targetRoot: string, now: Date): string {
  const backupRoot = join(targetRoot, ".gsd-backups");
  const baseName = `migrate-${formatBackupTimestamp(now)}`;
  let candidate = join(backupRoot, baseName);
  let suffix = 2;

  while (existsSync(candidate)) {
    candidate = join(backupRoot, `${baseName}-${suffix}`);
    suffix++;
  }

  return candidate;
}

export function prepareMigrationTarget(targetRoot: string, now: Date = new Date()): MigrationBackup {
  const targetGsdPath = gsdRoot(targetRoot);
  if (!existsSync(targetGsdPath)) {
    return { hadExistingGsd: false, backupPath: null, targetGsdPath };
  }

  const backupPath = nextBackupPath(targetRoot, now);
  mkdirSync(dirname(backupPath), { recursive: true });
  cpSync(targetGsdPath, backupPath, { recursive: true });
  rmSync(targetGsdPath, { recursive: true, force: true });

  return { hadExistingGsd: true, backupPath, targetGsdPath };
}

export function restoreMigrationTarget(backup: MigrationBackup): void {
  rmSync(backup.targetGsdPath, { recursive: true, force: true });
  if (backup.backupPath && existsSync(backup.backupPath)) {
    cpSync(backup.backupPath, backup.targetGsdPath, { recursive: true });
  }
}

export function assertMigrationHasSlices(preview: MigrationPreview): void {
  if (preview.totalSlices > 0) return;
  throw new MigrationBlockedError(
    "Migration blocked - the legacy project would produce zero slices. Add a ROADMAP.md or phases/ content before migrating.",
  );
}

function hasWorktreeState(targetRoot: string): boolean {
  const worktreesDir = join(gsdRoot(targetRoot), "worktrees");
  if (!existsSync(worktreesDir)) return false;
  try {
    return readdirSync(worktreesDir, { withFileTypes: true })
      .some((entry) => entry.isDirectory() || entry.isFile());
  } catch {
    return true;
  }
}

export async function assertMigrationTargetAvailable(targetRoot: string): Promise<void> {
  const targetGsdPath = gsdRoot(targetRoot);
  if (!existsSync(targetGsdPath)) return;

  if (hasWorktreeState(targetRoot)) {
    throw new MigrationBlockedError(
      "Migration blocked - existing GSD worktree state is present. Resolve or clean worktrees before migrating.",
    );
  }

  const opened = await ensureDbOpen(targetRoot);
  if (!opened) return;

  try {
    const lock = readCrashLock(targetRoot);
    if (lock && lock.pid !== process.pid && isLockProcessAlive(lock)) {
      throw new MigrationBlockedError(
        `Migration blocked - auto-mode appears to be running for this project (PID ${lock.pid}). Stop it before migrating.`,
      );
    }

    const paused = readPausedSessionMetadata(targetRoot);
    if (paused) {
      throw new MigrationBlockedError(
        "Migration blocked - a paused auto-mode session exists for this project. Resume or stop it before migrating.",
      );
    }
  } finally {
    closeDatabase();
  }
}
