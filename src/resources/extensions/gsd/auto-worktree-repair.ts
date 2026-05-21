// Project/App: GSD-2
// File Purpose: Helpers for safe auto-mode milestone worktree repair decisions.

import { existsSync, lstatSync, readdirSync, type Stats } from "node:fs";
import { join } from "node:path";

import { worktreePath } from "./worktree-manager.js";
import { normalizeWorktreePathForCompare } from "./worktree-root.js";
import type { WorktreeSafetyResult } from "./worktree-safety.js";

export interface AutoWorktreeRepairFs {
  existsSync(path: string): boolean;
  lstatSync(path: string): Pick<Stats, "isDirectory">;
  readdirSync(path: string): string[];
}

const defaultFs: AutoWorktreeRepairFs = {
  existsSync,
  lstatSync,
  readdirSync,
};

const SAFE_STALE_WORKTREE_ENTRIES = new Set([".gsd", ".DS_Store"]);

function isValidMilestoneId(milestoneId: string): boolean {
  return milestoneId.length > 0 && !/[\/\\]|\.\./.test(milestoneId);
}

function samePath(a: string, b: string): boolean {
  return normalizeWorktreePathForCompare(a) === normalizeWorktreePathForCompare(b);
}

export function expectedAutoWorktreePath(
  projectRoot: string,
  milestoneId: string | null | undefined,
): string | null {
  const id = milestoneId?.trim();
  if (!id || !isValidMilestoneId(id)) return null;
  return worktreePath(projectRoot, id);
}

export function resolvePausedAutoWorktreePath(input: {
  basePath: string;
  originalBasePath?: string | null;
  currentMilestoneId?: string | null;
  isolationMode: "none" | "branch" | "worktree";
  baseIsAutoWorktree: boolean;
}): string | null {
  if (input.baseIsAutoWorktree) return input.basePath;
  if (input.isolationMode !== "worktree") return null;
  return expectedAutoWorktreePath(
    input.originalBasePath || input.basePath,
    input.currentMilestoneId,
  );
}

export function isRecoverableAutoWorktreeSafetyFailure(
  result: WorktreeSafetyResult,
): boolean {
  if (result.ok) return false;
  return result.kind === "invalid-root"
    || result.kind === "worktree-missing"
    || result.kind === "worktree-git-marker-missing";
}

export type AutoWorktreeRepairAssessment =
  | { ok: true; expectedPath: string }
  | { ok: false; reason: string };

type RepairEnterResult = { ok: true } | { ok: false; reason: string };

export function assessAutoWorktreeRepairTarget(input: {
  projectRoot: string;
  milestoneId: string | null | undefined;
  expectedRoot?: string | null;
  activeRoot: string;
  fs?: AutoWorktreeRepairFs;
}): AutoWorktreeRepairAssessment {
  const fs = input.fs ?? defaultFs;
  const expectedPath = input.expectedRoot
    ?? expectedAutoWorktreePath(input.projectRoot, input.milestoneId);
  if (!expectedPath) {
    return { ok: false, reason: "missing expected worktree path" };
  }
  const computedExpectedPath = expectedAutoWorktreePath(input.projectRoot, input.milestoneId);
  if (!computedExpectedPath || !samePath(expectedPath, computedExpectedPath)) {
    return { ok: false, reason: "expected worktree path does not match milestone" };
  }
  if (!samePath(input.activeRoot, input.projectRoot) && !samePath(input.activeRoot, expectedPath)) {
    return { ok: false, reason: "active root is neither project root nor expected worktree" };
  }
  if (!fs.existsSync(expectedPath)) {
    return { ok: true, expectedPath };
  }

  let stat: Pick<Stats, "isDirectory">;
  try {
    stat = fs.lstatSync(expectedPath);
  } catch (error) {
    return {
      ok: false,
      reason: `expected worktree path cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!stat.isDirectory()) {
    return { ok: false, reason: "expected worktree path is not a directory" };
  }

  if (fs.existsSync(join(expectedPath, ".git"))) {
    return { ok: false, reason: "expected worktree path already has git metadata" };
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(expectedPath);
  } catch (error) {
    return {
      ok: false,
      reason: `expected worktree path cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const unsafeEntries = entries.filter((entry) => !SAFE_STALE_WORKTREE_ENTRIES.has(entry));
  if (unsafeEntries.length > 0) {
    return {
      ok: false,
      reason: `stale worktree has non-GSD content: ${unsafeEntries.join(", ")}`,
    };
  }

  return { ok: true, expectedPath };
}

export async function repairAutoWorktreeSafetyFailure(input: {
  safetyResult: WorktreeSafetyResult;
  projectRoot: string;
  activeRoot: string;
  milestoneId: string | null | undefined;
  enterMilestone: (
    milestoneId: string,
    expectedPath: string,
  ) => Promise<RepairEnterResult> | RepairEnterResult;
  revalidate: () => Promise<WorktreeSafetyResult> | WorktreeSafetyResult;
}): Promise<{
  result: WorktreeSafetyResult;
  repaired: boolean;
  repairReason?: string;
}> {
  if (input.safetyResult.ok || !isRecoverableAutoWorktreeSafetyFailure(input.safetyResult)) {
    return { result: input.safetyResult, repaired: false };
  }

  const expectedRoot = typeof input.safetyResult.details?.expectedRoot === "string"
    ? input.safetyResult.details.expectedRoot
    : null;
  const repairTarget = assessAutoWorktreeRepairTarget({
    projectRoot: input.projectRoot,
    milestoneId: input.milestoneId,
    expectedRoot,
    activeRoot: input.activeRoot,
  });
  if (!repairTarget.ok) {
    return {
      result: input.safetyResult,
      repaired: false,
      repairReason: repairTarget.reason,
    };
  }

  const milestoneId = input.milestoneId?.trim();
  if (!milestoneId || !isValidMilestoneId(milestoneId)) {
    return {
      result: input.safetyResult,
      repaired: false,
      repairReason: "invalid milestone id",
    };
  }

  const entered = await input.enterMilestone(milestoneId, repairTarget.expectedPath);
  if (!entered.ok) {
    return {
      result: input.safetyResult,
      repaired: false,
      repairReason: entered.reason,
    };
  }

  const revalidated = await input.revalidate();
  return {
    result: revalidated,
    repaired: revalidated.ok,
    repairReason: revalidated.ok ? "revalidated" : "revalidation failed",
  };
}
