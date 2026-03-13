export interface GitStatusResult {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
}
