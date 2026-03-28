/**
 * GSD Error Types — Typed error hierarchy for diagnostics and crash recovery.
 *
 * All GSD-specific errors extend GSDError, which carries a stable `code`
 * string suitable for programmatic matching. Error codes are defined as
 * constants so callers can switch on them without string-matching.
 */

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const GSD_STALE_STATE = "GSD_STALE_STATE";
export const GSD_LOCK_HELD = "GSD_LOCK_HELD";
export const GSD_ARTIFACT_MISSING = "GSD_ARTIFACT_MISSING";
export const GSD_GIT_ERROR = "GSD_GIT_ERROR";
export const GSD_MERGE_CONFLICT = "GSD_MERGE_CONFLICT";
export const GSD_PARSE_ERROR = "GSD_PARSE_ERROR";
export const GSD_IO_ERROR = "GSD_IO_ERROR";

// ─── Base Error ───────────────────────────────────────────────────────────────

export class GSDError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GSDError";
    this.code = code;
  }
}

// ─── Git Errors ───────────────────────────────────────────────────────────────

/**
 * Thrown when a slice merge hits code conflicts in non-.gsd files.
 * The working tree is left in a conflicted state (no reset) so the
 * caller can dispatch a fix-merge session to resolve it.
 */
export class MergeConflictError extends GSDError {
  readonly conflictedFiles: string[];
  readonly strategy: "squash" | "merge";
  readonly branch: string;
  readonly mainBranch: string;

  constructor(
    conflictedFiles: string[],
    strategy: "squash" | "merge",
    branch: string,
    mainBranch: string,
  ) {
    super(
      GSD_MERGE_CONFLICT,
      `${strategy === "merge" ? "Merge" : "Squash-merge"} of "${branch}" into "${mainBranch}" ` +
      `failed with conflicts in ${conflictedFiles.length} non-.gsd file(s): ${conflictedFiles.join(", ")}`,
    );
    this.name = "MergeConflictError";
    this.conflictedFiles = conflictedFiles;
    this.strategy = strategy;
    this.branch = branch;
    this.mainBranch = mainBranch;
  }
}
