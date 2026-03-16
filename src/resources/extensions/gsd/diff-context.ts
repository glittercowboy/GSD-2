/**
 * Diff-aware context module — prioritizes recently-changed files when building
 * context for the AI agent. Uses git diff/status to discover changes, then
 * provides ranking utilities for context-window budget allocation.
 *
 * Standalone module: only imports node:child_process and node:path.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChangedFileInfo {
  path: string;
  changeType: "modified" | "added" | "deleted" | "staged";
  linesChanged?: number;
}

export interface RecentFilesOptions {
  /** Maximum number of files to return (default 20) */
  maxFiles?: number;
  /** Only consider commits within this many days (default 7) */
  sinceDays?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const EXEC_OPTS = {
  encoding: "utf-8" as const,
  timeout: 5000,
  stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
};

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { ...EXEC_OPTS, cwd }).trim();
}

function splitLines(output: string): string[] {
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns recently-changed file paths, deduplicated and sorted by recency
 * (most recent first). Combines committed diffs, staged changes, and
 * unstaged/untracked files from `git status`.
 */
export async function getRecentlyChangedFiles(
  cwd: string,
  options?: RecentFilesOptions,
): Promise<string[]> {
  const maxFiles = options?.maxFiles ?? 20;
  const sinceDays = options?.sinceDays ?? 7;
  const dir = resolve(cwd);

  try {
    // 1. Committed changes in the last N commits (or since sinceDays)
    let committedFiles: string[] = [];
    try {
      const days = Math.max(1, Math.floor(Number(sinceDays)));
      if (!Number.isFinite(days)) throw new Error("invalid sinceDays");
      const raw = git(["log", "--diff-filter=ACMR", "--name-only", "--pretty=format:", `--since=${days} days ago`], dir);
      committedFiles = splitLines(raw);
    } catch {
      // Fallback: use HEAD~10
      try {
        const raw = git(["diff", "--name-only", "HEAD~10"], dir);
        committedFiles = splitLines(raw);
      } catch {
        // Shallow clone or <10 commits — ignore
      }
    }

    // 2. Staged changes
    let stagedFiles: string[] = [];
    try {
      const raw = git(["diff", "--cached", "--name-only"], dir);
      stagedFiles = splitLines(raw);
    } catch {
      // ignore
    }

    // 3. Unstaged / untracked via porcelain status
    let statusFiles: string[] = [];
    try {
      const raw = git(["status", "--porcelain"], dir);
      statusFiles = splitLines(raw).map((line) => line.slice(3)); // strip XY + space
    } catch {
      // ignore
    }

    // Deduplicate, preserving insertion order (most-recent-first: status → staged → committed)
    const seen = new Set<string>();
    const result: string[] = [];
    for (const file of [...statusFiles, ...stagedFiles, ...committedFiles]) {
      if (!seen.has(file)) {
        seen.add(file);
        result.push(file);
      }
    }

    return result.slice(0, maxFiles);
  } catch {
    // Non-git directory or git unavailable — graceful fallback
    return [];
  }
}

/**
 * Returns richer change metadata: change type and approximate line counts.
 */
export async function getChangedFilesWithContext(
  cwd: string,
): Promise<ChangedFileInfo[]> {
  const dir = resolve(cwd);

  try {
    const result: ChangedFileInfo[] = [];
    const seen = new Set<string>();

    const add = (info: ChangedFileInfo) => {
      if (!seen.has(info.path)) {
        seen.add(info.path);
        result.push(info);
      }
    };

    // 1. Staged files with numstat
    try {
      const numstat = git(["diff", "--cached", "--numstat"], dir);
      for (const line of splitLines(numstat)) {
        const [added, deleted, filePath] = line.split("\t");
        if (!filePath) continue;
        const lines =
          added === "-" || deleted === "-"
            ? undefined
            : Number(added) + Number(deleted);
        add({ path: filePath, changeType: "staged", linesChanged: lines });
      }
    } catch {
      // ignore
    }

    // 2. Unstaged modifications with numstat
    try {
      const numstat = git(["diff", "--numstat"], dir);
      for (const line of splitLines(numstat)) {
        const [added, deleted, filePath] = line.split("\t");
        if (!filePath) continue;
        const lines =
          added === "-" || deleted === "-"
            ? undefined
            : Number(added) + Number(deleted);
        add({ path: filePath, changeType: "modified", linesChanged: lines });
      }
    } catch {
      // ignore
    }

    // 3. Untracked / deleted from porcelain status
    try {
      const raw = git(["status", "--porcelain"], dir);
      for (const line of splitLines(raw)) {
        const code = line.slice(0, 2);
        const filePath = line.slice(3);
        if (seen.has(filePath)) continue;

        if (code.includes("?")) {
          add({ path: filePath, changeType: "added" });
        } else if (code.includes("D")) {
          add({ path: filePath, changeType: "deleted" });
        } else if (code.includes("A")) {
          add({ path: filePath, changeType: "added" });
        } else {
          add({ path: filePath, changeType: "modified" });
        }
      }
    } catch {
      // ignore
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Ranks a file list so that recently-changed files appear first.
 * Files present in `changedFiles` are placed at the front (in their
 * original changedFiles order), followed by unchanged files in their
 * original order.
 */
export function rankFilesByRelevance(
  files: string[],
  changedFiles: string[],
): string[] {
  const changedSet = new Set(changedFiles);
  const changed: string[] = [];
  const rest: string[] = [];

  for (const f of files) {
    if (changedSet.has(f)) {
      changed.push(f);
    } else {
      rest.push(f);
    }
  }

  // Maintain changedFiles priority order within the changed group
  const changedOrder = new Map(changedFiles.map((f, i) => [f, i]));
  changed.sort((a, b) => (changedOrder.get(a) ?? 0) - (changedOrder.get(b) ?? 0));

  return [...changed, ...rest];
}
