// Project/App: GSD-2
// File Purpose: Closeout git failure discovery, retry, and manual resolution helpers.

import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { GIT_NO_PROMPT_ENV } from "./git-constants.js";
import { runTurnGitAction, type TurnGitActionMode, type TurnGitActionResult } from "./git-service.js";
import { _getAdapter, upsertTurnGitTransaction } from "./gsd-db.js";
import { listUnmergedGitPaths } from "./git-conflict-state.js";
import { parseUnitId } from "./unit-id.js";

export interface CloseoutFailureRecord {
  traceId: string;
  turnId: string;
  unitType: string;
  unitId: string;
  action: TurnGitActionMode;
  error: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  recoveryStatus: "ok" | "failed" | null;
  recoveryError: string | null;
  recoveryUpdatedAt: string | null;
  manualStatus: "ok" | "failed" | null;
  manualError: string | null;
  manualUpdatedAt: string | null;
  resolved: boolean;
}

export type CloseoutRetryResult =
  | { status: "not-found"; message: string }
  | { status: "ok" | "failed"; record: CloseoutFailureRecord; basePath: string; gitResult: TurnGitActionResult };

export type CloseoutResolveResult =
  | { status: "not-found"; message: string }
  | { status: "blocked"; record: CloseoutFailureRecord; basePath: string; message: string }
  | { status: "ok"; record: CloseoutFailureRecord; basePath: string };

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function rowString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function nullableStatus(row: Record<string, unknown>, key: string): "ok" | "failed" | null {
  const value = rowString(row, key);
  return value === "ok" || value === "failed" ? value : null;
}

function normalizeAction(value: string): TurnGitActionMode {
  if (value === "commit" || value === "snapshot" || value === "status-only") return value;
  return "status-only";
}

function rowToRecord(row: Record<string, unknown>): CloseoutFailureRecord {
  const recoveryStatus = nullableStatus(row, "recovery_status");
  const manualStatus = nullableStatus(row, "manual_status");
  return {
    traceId: rowString(row, "trace_id"),
    turnId: rowString(row, "turn_id"),
    unitType: rowString(row, "unit_type"),
    unitId: rowString(row, "unit_id"),
    action: normalizeAction(rowString(row, "action")),
    error: rowString(row, "error"),
    updatedAt: rowString(row, "updated_at"),
    metadata: parseMetadata(row["metadata_json"]),
    recoveryStatus,
    recoveryError: rowString(row, "recovery_error") || null,
    recoveryUpdatedAt: rowString(row, "recovery_updated_at") || null,
    manualStatus,
    manualError: rowString(row, "manual_error") || null,
    manualUpdatedAt: rowString(row, "manual_updated_at") || null,
    resolved: recoveryStatus === "ok" || manualStatus === "ok",
  };
}

export function listCloseoutFailures(): CloseoutFailureRecord[] {
  const db = _getAdapter();
  if (!db) return [];
  const rows = db.prepare(
    `SELECT
       f.trace_id,
       f.turn_id,
       f.unit_type,
       f.unit_id,
       f.action,
       f.error,
       f.metadata_json,
       f.updated_at,
       r.status AS recovery_status,
       r.error AS recovery_error,
       r.updated_at AS recovery_updated_at,
       m.status AS manual_status,
       m.error AS manual_error,
       m.updated_at AS manual_updated_at
     FROM turn_git_transactions f
     LEFT JOIN turn_git_transactions r
       ON r.trace_id = f.trace_id
      AND r.turn_id = f.turn_id
      AND r.stage = 'recovery'
     LEFT JOIN turn_git_transactions m
       ON m.trace_id = f.trace_id
      AND m.turn_id = f.turn_id
      AND m.stage = 'manual-resolved'
     WHERE f.stage = 'publish'
       AND f.status = 'failed'
     ORDER BY f.updated_at DESC, f.trace_id DESC, f.turn_id DESC`,
  ).all() as Array<Record<string, unknown>>;
  return rows.map(rowToRecord);
}

export function listUnresolvedCloseoutFailures(): CloseoutFailureRecord[] {
  return listCloseoutFailures().filter((record) => !record.resolved);
}

export function formatCloseoutAutoBlockMessage(count: number): string {
  const noun = count === 1 ? "failure" : "failures";
  return `Closeout recovery required: ${count} unresolved git closeout ${noun}. Run /gsd closeout status, then /gsd closeout retry or /gsd closeout resolve before resuming auto-mode.`;
}

function selectFailure(unitId?: string): CloseoutFailureRecord | null {
  const unresolved = listUnresolvedCloseoutFailures();
  if (!unitId) return unresolved[0] ?? null;
  return unresolved.find((record) => record.unitId === unitId || record.unitId.endsWith(`/${unitId}`)) ?? null;
}

function existingRealPath(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function resolveCloseoutRecoveryBasePath(projectRoot: string, record: CloseoutFailureRecord): string {
  const metadataBasePath = typeof record.metadata.basePath === "string" ? record.metadata.basePath.trim() : "";
  if (metadataBasePath) {
    const resolved = existingRealPath(isAbsolute(metadataBasePath) ? metadataBasePath : resolve(projectRoot, metadataBasePath));
    if (resolved) return resolved;
  }

  const parsed = parseUnitId(record.unitId);
  const milestoneId = parsed.milestone ?? (/^M\d+(?:-[a-z0-9]{6})?/.exec(record.unitId)?.[0] ?? "");
  if (milestoneId) {
    const worktreePath = existingRealPath(join(projectRoot, ".gsd", "worktrees", milestoneId));
    if (worktreePath) return worktreePath;
  }

  return projectRoot;
}

function runGit(basePath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: basePath,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: GIT_NO_PROMPT_ENV,
  }).trim();
}

function gitPathExists(basePath: string, marker: string): boolean {
  try {
    const raw = runGit(basePath, ["rev-parse", "--git-path", marker]);
    if (!raw) return false;
    const markerPath = isAbsolute(raw) ? raw : resolve(basePath, raw);
    return existsSync(markerPath);
  } catch {
    return false;
  }
}

export function getCloseoutManualResolveBlocker(basePath: string): string | null {
  const markers = [
    ["MERGE_HEAD", "merge"],
    ["rebase-merge", "rebase"],
    ["rebase-apply", "rebase"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
  ] as const;
  for (const [marker, label] of markers) {
    if (gitPathExists(basePath, marker)) {
      return `Git ${label} state is still active in ${basePath}. Finish or abort it before resolving closeout recovery.`;
    }
  }

  const unmerged = listUnmergedGitPaths(basePath);
  if (unmerged === null) {
    return `Could not inspect git conflicts in ${basePath}.`;
  }
  if (unmerged.length > 0) {
    return `Unmerged paths remain in ${basePath}: ${unmerged.slice(0, 5).join(", ")}`;
  }

  const status = runGit(basePath, ["status", "--porcelain"]);
  if (status) {
    return `Working tree still has uncommitted changes in ${basePath}. Commit, stash, or run /gsd closeout retry first.`;
  }

  return null;
}

function writeRecoveryRecord(
  record: CloseoutFailureRecord,
  stage: "recovery" | "manual-resolved",
  status: "ok" | "failed",
  action: TurnGitActionMode,
  basePath: string,
  error?: string,
  metadata?: Record<string, unknown>,
): void {
  upsertTurnGitTransaction({
    traceId: record.traceId,
    turnId: record.turnId,
    unitType: record.unitType,
    unitId: record.unitId,
    stage,
    action,
    push: false,
    status,
    error,
    metadata: {
      basePath,
      recoveredAt: new Date().toISOString(),
      ...(metadata ?? {}),
    },
    updatedAt: new Date().toISOString(),
  });
}

export function retryLatestCloseoutFailure(projectRoot: string, unitId?: string): CloseoutRetryResult {
  const record = selectFailure(unitId);
  if (!record) {
    return { status: "not-found", message: "No unresolved closeout git failures found." };
  }

  const basePath = resolveCloseoutRecoveryBasePath(projectRoot, record);
  const gitResult = runTurnGitAction({
    basePath,
    action: record.action,
    unitType: record.unitType,
    unitId: record.unitId,
  });

  writeRecoveryRecord(record, "recovery", gitResult.status, record.action, basePath, gitResult.error, {
    dirty: gitResult.dirty,
    dirtyRepositories: gitResult.dirtyRepositories,
    commitMessage: gitResult.commitMessage,
    commitMessages: gitResult.commitMessages,
    commitErrors: gitResult.commitErrors,
    skippedRepositories: gitResult.skippedRepositories,
    snapshotLabel: gitResult.snapshotLabel,
  });

  return { status: gitResult.status, record, basePath, gitResult };
}

export function markLatestCloseoutFailureResolved(projectRoot: string, unitId?: string): CloseoutResolveResult {
  const record = selectFailure(unitId);
  if (!record) {
    return { status: "not-found", message: "No unresolved closeout git failures found." };
  }

  const basePath = resolveCloseoutRecoveryBasePath(projectRoot, record);
  const blocker = getCloseoutManualResolveBlocker(basePath);
  if (blocker) {
    writeRecoveryRecord(record, "manual-resolved", "failed", record.action, basePath, blocker, {
      resolvedBy: "manual",
    });
    return { status: "blocked", record, basePath, message: blocker };
  }

  writeRecoveryRecord(record, "manual-resolved", "ok", record.action, basePath, undefined, {
    resolvedBy: "manual",
  });
  return { status: "ok", record, basePath };
}
