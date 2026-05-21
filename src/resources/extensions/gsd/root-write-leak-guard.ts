// Project/App: GSD-2
// File Purpose: Detect project-root file writes during isolated milestone worktree units.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface RootDirtyEntry {
  path: string;
  status: string;
  fingerprint: string;
}

export interface RootWriteLeak {
  rootPath: string;
  worktreePath: string;
  unitType: string;
  unitId: string;
  files: RootDirtyEntry[];
}

export type RootDirtySnapshot = Map<string, RootDirtyEntry>;

function isRootRuntimePath(path: string): boolean {
  return path === ".gsd" || path.startsWith(".gsd/");
}

function fileFingerprint(rootPath: string, relPath: string): string {
  const absPath = join(rootPath, relPath);
  if (!existsSync(absPath)) return "missing";
  const stat = statSync(absPath);
  if (!stat.isFile()) return `${stat.isDirectory() ? "dir" : "other"}:${stat.size}:${stat.mtimeMs}`;
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

export function captureRootDirtySnapshot(rootPath: string): RootDirtySnapshot {
  const snapshot: RootDirtySnapshot = new Map();
  let status = "";
  try {
    status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: rootPath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
  } catch {
    return snapshot;
  }

  for (const line of status.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).replace(/^"|"$/g, "");
    if (!path || isRootRuntimePath(path)) continue;
    snapshot.set(path, {
      path,
      status: code.trim() || code,
      fingerprint: fileFingerprint(rootPath, path),
    });
  }
  return snapshot;
}

export function detectRootWriteLeak(input: {
  rootPath: string;
  worktreePath: string;
  unitType: string;
  unitId: string;
  before: RootDirtySnapshot | null | undefined;
}): RootWriteLeak | null {
  const after = captureRootDirtySnapshot(input.rootPath);
  const leaked: RootDirtyEntry[] = [];
  for (const entry of after.values()) {
    const prior = input.before?.get(entry.path);
    if (!prior || prior.status !== entry.status || prior.fingerprint !== entry.fingerprint) {
      leaked.push(entry);
    }
  }
  if (leaked.length === 0) return null;
  return {
    rootPath: input.rootPath,
    worktreePath: input.worktreePath,
    unitType: input.unitType,
    unitId: input.unitId,
    files: leaked,
  };
}

export function formatRootWriteLeakMessage(leak: RootWriteLeak): string {
  const files = leak.files
    .map((file) => `  ${file.status.padEnd(2)} ${file.path}`)
    .join("\n");
  return [
    `Root-write leak detected after ${leak.unitType} ${leak.unitId}.`,
    `Project root: ${leak.rootPath}`,
    `Expected worktree: ${leak.worktreePath}`,
    "Root files changed during isolated auto-mode:",
    files,
    "Review the root diff, then commit, stash, or discard those root changes before resuming /gsd auto.",
  ].join("\n");
}
