// GSD Watch — Shared types and constants for the watch sidebar module
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/** Metadata stored in the watch lock file for singleton guard + stale detection. */
export interface WatchLockData {
  pid: number;        // renderer process PID
  paneId: string;     // tmux pane ID (e.g., "%12") for stale pane cleanup
  startedAt: string;  // ISO timestamp
  projectRoot: string; // project root path
}

/** Debounce interval for coalescing file-change events (ms). Per D-16, within 300-400ms range. */
export const DEBOUNCE_MS = 300;

/** Glob patterns to ignore inside .planning/ — editor temp/swap files per D-15. */
export const IGNORED_PATTERNS: string[] = [
  "**/.DS_Store",
  "**/*.swp",
  "**/*~",
  "**/*.tmp",
  "**/.gsd-watch.lock",
];

/** Lock file name for watch singleton guard. Placed in .gsd/ to avoid feedback loop. */
export const WATCH_LOCK_FILE = "watch.lock";
