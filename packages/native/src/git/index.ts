import { native } from "../native.js";
import type { GitStatusResult, GitLogEntry } from "./types.js";

export type { GitStatusResult, GitLogEntry };

export function gitStatus(repoPath: string): GitStatusResult {
  return native.gitStatus(repoPath) as GitStatusResult;
}

export function gitDiff(repoPath: string, staged?: boolean): string {
  return native.gitDiff(repoPath, staged) as string;
}

export function gitLog(repoPath: string, maxCount?: number): GitLogEntry[] {
  return native.gitLog(repoPath, maxCount) as GitLogEntry[];
}

export function gitCurrentBranch(repoPath: string): string {
  return native.gitCurrentBranch(repoPath) as string;
}

export function gitIsClean(repoPath: string): boolean {
  return native.gitIsClean(repoPath) as boolean;
}

export function gitStageFiles(repoPath: string, paths: string[]): void {
  native.gitStageFiles(repoPath, paths);
}

export function gitCommit(
  repoPath: string,
  message: string,
  authorName: string,
  authorEmail: string,
): string {
  return native.gitCommit(repoPath, message, authorName, authorEmail) as string;
}
