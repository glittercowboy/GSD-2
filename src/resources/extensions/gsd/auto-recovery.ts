/**
 * Auto-mode Recovery — artifact resolution, verification, merge state
 * reconciliation, and loop remediation steps.
 *
 * Pure functions that receive all needed state as parameters — no module-level
 * globals or AutoContext dependency.
 *
 * Note: writeBlockerPlaceholder, skipExecuteTask, and selfHealRuntimeRecords
 * were removed in Phase 4 (D-05). Recovery blockers use engine.reportBlocker().
 */

import type { ExtensionContext } from "@gsd/pi-coding-agent";
import { isValidationTerminal } from "./state.js";
import { WorkflowEngine, isEngineAvailable } from "./workflow-engine.js";
import { renderAllProjections } from "./workflow-projections.js";
import {
  nativeConflictFiles,
  nativeCommit,
  nativeCheckoutTheirs,
  nativeAddPaths,
  nativeMergeAbort,
  nativeResetHard,
} from "./native-git-bridge.js";
import {
  resolveMilestonePath,
  resolveSlicePath,
  resolveSliceFile,
  resolveTasksDir,
  resolveTaskFiles,
  relMilestoneFile,
  relSliceFile,
  relSlicePath,
  relTaskFile,
  buildMilestoneFileName,
  buildSliceFileName,
  buildTaskFileName,
  resolveMilestoneFile,
  clearPathCache,
  resolveGsdRootFile,
} from "./paths.js";
import {
  existsSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// ─── Artifact Resolution & Verification ───────────────────────────────────────

/**
 * Resolve the expected artifact for a unit to an absolute path.
 */
export function resolveExpectedArtifactPath(
  unitType: string,
  unitId: string,
  base: string,
): string | null {
  const parts = unitId.split("/");
  const mid = parts[0]!;
  const sid = parts[1];
  switch (unitType) {
    case "discuss-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "CONTEXT")) : null;
    }
    case "research-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "RESEARCH")) : null;
    }
    case "plan-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "ROADMAP")) : null;
    }
    case "research-slice": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "RESEARCH")) : null;
    }
    case "plan-slice": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "PLAN")) : null;
    }
    case "reassess-roadmap": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "ASSESSMENT")) : null;
    }
    case "run-uat": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "UAT-RESULT")) : null;
    }
    case "execute-task": {
      const tid = parts[2];
      const dir = resolveSlicePath(base, mid, sid!);
      return dir && tid
        ? join(dir, "tasks", buildTaskFileName(tid, "SUMMARY"))
        : null;
    }
    case "complete-slice": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "SUMMARY")) : null;
    }
    case "validate-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "VALIDATION")) : null;
    }
    case "complete-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "SUMMARY")) : null;
    }
    case "replan-slice": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "REPLAN")) : null;
    }
    case "rewrite-docs":
      return null;
    case "reactive-execute":
      // Reactive execute produces multiple task summaries — verified separately
      return null;
    default:
      return null;
  }
}

/**
 * Check whether a milestone produced implementation artifacts (non-`.gsd/` files)
 * in the git history. Uses `git log --name-only` to inspect all commits on the
 * current branch that touch files outside `.gsd/`.
 *
 * Returns true if at least one non-`.gsd/` file was committed, false otherwise.
 * Non-fatal: returns true on git errors to avoid blocking the pipeline when
 * running outside a git repo (e.g., tests).
 */
export function hasImplementationArtifacts(basePath: string): boolean {
  try {
    // Verify we're in a git repo — fail open if not
    try {
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: basePath,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
      });
    } catch {
      return true;
    }

    // Strategy: check `git diff --name-only` against the merge-base with the
    // main branch. This captures ALL files changed during the milestone's
    // lifetime. If no merge-base exists (e.g., single-branch workflow), fall
    // back to checking the last N commits.
    const mainBranch = detectMainBranch(basePath);
    const changedFiles = getChangedFilesSinceBranch(basePath, mainBranch);

    // No files changed at all — fail open (could be detached HEAD, single-
    // commit repo, or other edge case where git diff returns nothing).
    if (changedFiles.length === 0) return true;

    // Filter out .gsd/ files — only implementation files count.
    // If every changed file is under .gsd/, the milestone produced no
    // implementation code (#1703).
    const implFiles = changedFiles.filter(f => !f.startsWith(".gsd/") && !f.startsWith(".gsd\\"));
    return implFiles.length > 0;
  } catch {
    // Non-fatal — if git operations fail, don't block the pipeline
    return true;
  }
}

/**
 * Detect the main/master branch name.
 */
function detectMainBranch(basePath: string): string {
  try {
    const result = execFileSync("git", ["rev-parse", "--verify", "main"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
    if (result.trim()) return "main";
  } catch {
    // main doesn't exist
  }
  try {
    const result = execFileSync("git", ["rev-parse", "--verify", "master"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
    if (result.trim()) return "master";
  } catch {
    // master doesn't exist either
  }
  return "main"; // default fallback
}

/**
 * Get files changed since the branch diverged from the target branch.
 * Falls back to checking HEAD~20 if merge-base detection fails.
 */
function getChangedFilesSinceBranch(basePath: string, targetBranch: string): string[] {
  try {
    // Try merge-base approach first
    const mergeBase = execFileSync(
      "git", ["merge-base", targetBranch, "HEAD"],
      { cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
    ).trim();

    if (mergeBase) {
      const result = execFileSync(
        "git", ["diff", "--name-only", mergeBase, "HEAD"],
        { cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
      ).trim();
      return result ? result.split("\n").filter(Boolean) : [];
    }
  } catch {
    // merge-base failed — fall back
  }

  // Fallback: check last 20 commits
  try {
    const result = execFileSync(
      "git", ["log", "--name-only", "--pretty=format:", "-20", "HEAD"],
      { cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
    ).trim();
    return result ? [...new Set(result.split("\n").filter(Boolean))] : [];
  } catch {
    return [];
  }
}

/**
 * Check whether the expected artifact(s) for a unit exist on disk.
 * Returns true if all required artifacts exist, or if the unit type has no
 * single verifiable artifact (e.g., replan-slice).
 *
 * complete-slice requires both SUMMARY and UAT files — verifying only
 * the summary allowed the unit to be marked complete when the LLM
 * skipped writing the UAT file (see #176).
 */
export function verifyExpectedArtifact(
  unitType: string,
  unitId: string,
  base: string,
): boolean {
  // Hook units have no standard artifact — always pass. Their lifecycle
  // is managed by the hook engine, not the artifact verification system.
  if (unitType.startsWith("hook/")) return true;

  // Clear stale directory listing cache so artifact checks see fresh disk state (#431).
  clearPathCache();

  if (unitType === "rewrite-docs") {
    const overridesPath = resolveGsdRootFile(base, "OVERRIDES");
    if (!existsSync(overridesPath)) return true;
    const content = readFileSync(overridesPath, "utf-8");
    return !content.includes("**Scope:** active");
  }

  // Reactive-execute: verify that each dispatched task's summary exists.
  // The unitId encodes the batch: "{mid}/{sid}/reactive+T02,T03"
  if (unitType === "reactive-execute") {
    const parts = unitId.split("/");
    const mid = parts[0];
    const sidAndBatch = parts[1];
    const batchPart = parts[2]; // "reactive+T02,T03"
    if (!mid || !sidAndBatch || !batchPart) return false;

    const sid = sidAndBatch;
    const plusIdx = batchPart.indexOf("+");
    if (plusIdx === -1) {
      // Legacy format "reactive" without batch IDs — fall back to "any summary"
      const tDir = resolveTasksDir(base, mid, sid);
      if (!tDir) return false;
      const summaryFiles = resolveTaskFiles(tDir, "SUMMARY");
      return summaryFiles.length > 0;
    }

    const batchIds = batchPart.slice(plusIdx + 1).split(",").filter(Boolean);
    if (batchIds.length === 0) return false;

    const tDir = resolveTasksDir(base, mid, sid);
    if (!tDir) return false;

    const existingSummaries = new Set(
      resolveTaskFiles(tDir, "SUMMARY").map((f) =>
        f.replace(/-SUMMARY\.md$/i, "").toUpperCase(),
      ),
    );

    // Every dispatched task must have a summary file
    for (const tid of batchIds) {
      if (!existingSummaries.has(tid.toUpperCase())) return false;
    }
    return true;
  }

  const absPath = resolveExpectedArtifactPath(unitType, unitId, base);
  // For unit types with no verifiable artifact (null path), the parent directory
  // is missing on disk — treat as stale completion state so the key gets evicted (#313).
  if (!absPath) return false;
  if (!existsSync(absPath)) return false;

  if (unitType === "validate-milestone") {
    const validationContent = readFileSync(absPath, "utf-8");
    if (!isValidationTerminal(validationContent)) return false;
  }

  // plan-slice: query engine for task entries if available, else fall back to
  // regex-based task detection on the plan file content.
  if (unitType === "plan-slice") {
    const parts = unitId.split("/");
    const mid = parts[0];
    const sid = parts[1];
    if (isEngineAvailable(base) && mid && sid) {
      const engine = new WorkflowEngine(base);
      const tasks = engine.getTasks(mid, sid);
      return tasks.length > 0;
    }
    // Fallback: check plan file content for task entries
    const planContent = readFileSync(absPath, "utf-8");
    const hasCheckboxTask = /^- \[[xX ]\] \*\*T\d+:/m.test(planContent);
    const hasHeadingTask = /^#{2,4}\s+T\d+\s*(?:--|—|:)/m.test(planContent);
    if (!hasCheckboxTask && !hasHeadingTask) return false;
  }

  // execute-task: query engine for task status if available, else fall back to
  // file-existence check (absPath already verified above).
  if (unitType === "execute-task") {
    const parts = unitId.split("/");
    const mid = parts[0];
    const sid = parts[1];
    const tid = parts[2];
    if (isEngineAvailable(base) && mid && sid && tid) {
      const engine = new WorkflowEngine(base);
      const taskRow = engine.getTask(mid, sid, tid);
      if (!taskRow || taskRow.status !== "done") return false;
      if (!taskRow.summary) return false;
      // Self-healing: re-render projection if file missing
      const projPath = resolveExpectedArtifactPath(unitType, unitId, base);
      if (projPath && !existsSync(projPath)) {
        try { renderAllProjections(base, mid); } catch { /* non-fatal */ }
      }
      return true;
    }
    // Fallback: file existence (already checked via absPath above) is sufficient
  }

  // complete-slice: query engine for slice status if available, else fall back
  // to UAT file existence check.
  if (unitType === "complete-slice") {
    const parts = unitId.split("/");
    const mid = parts[0];
    const sid = parts[1];
    if (isEngineAvailable(base) && mid && sid) {
      const engine = new WorkflowEngine(base);
      const sliceRow = engine.getSlice(mid, sid);
      if (!sliceRow || sliceRow.status !== "done") return false;
      // UAT file existence check remains (projection artifact)
      return true;
    }
    // Fallback: check UAT file exists
    if (mid && sid) {
      const dir = resolveSlicePath(base, mid, sid);
      if (dir) {
        const uatPath = join(dir, buildSliceFileName(sid, "UAT"));
        if (!existsSync(uatPath)) return false;
      }
    }
  }

  // complete-milestone must have produced implementation artifacts (#1703).
  // A milestone with only .gsd/ plan files and zero implementation code is
  // not genuinely complete — the LLM wrote plan files but skipped actual work.
  if (unitType === "complete-milestone") {
    if (!hasImplementationArtifacts(base)) return false;
  }

  return true;
}

// writeBlockerPlaceholder removed (D-05) — replaced by engine.reportBlocker()

export function diagnoseExpectedArtifact(
  unitType: string,
  unitId: string,
  base: string,
): string | null {
  const parts = unitId.split("/");
  const mid = parts[0];
  const sid = parts[1];
  switch (unitType) {
    case "discuss-milestone":
      return `${relMilestoneFile(base, mid!, "CONTEXT")} (milestone context from discussion)`;
    case "research-milestone":
      return `${relMilestoneFile(base, mid!, "RESEARCH")} (milestone research)`;
    case "plan-milestone":
      return `${relMilestoneFile(base, mid!, "ROADMAP")} (milestone roadmap)`;
    case "research-slice":
      return `${relSliceFile(base, mid!, sid!, "RESEARCH")} (slice research)`;
    case "plan-slice":
      return `${relSliceFile(base, mid!, sid!, "PLAN")} (slice plan)`;
    case "execute-task": {
      const tid = parts[2];
      return `Task ${tid} marked [x] in ${relSliceFile(base, mid!, sid!, "PLAN")} + summary written`;
    }
    case "complete-slice":
      return `Slice ${sid} marked [x] in ${relMilestoneFile(base, mid!, "ROADMAP")} + summary + UAT written`;
    case "replan-slice":
      return `${relSliceFile(base, mid!, sid!, "REPLAN")} + updated ${relSliceFile(base, mid!, sid!, "PLAN")}`;
    case "rewrite-docs":
      return "Active overrides resolved in .gsd/OVERRIDES.md + plan documents updated";
    case "reassess-roadmap":
      return `${relSliceFile(base, mid!, sid!, "ASSESSMENT")} (roadmap reassessment)`;
    case "run-uat":
      return `${relSliceFile(base, mid!, sid!, "UAT-RESULT")} (UAT result)`;
    case "validate-milestone":
      return `${relMilestoneFile(base, mid!, "VALIDATION")} (milestone validation report)`;
    case "complete-milestone":
      return `${relMilestoneFile(base, mid!, "SUMMARY")} (milestone summary)`;
    default:
      return null;
  }
}

// skipExecuteTask removed (D-05) — replaced by engine.reportBlocker()

// ─── Merge State Reconciliation ───────────────────────────────────────────────

/**
 * Detect leftover merge state from a prior session and reconcile it.
 * If MERGE_HEAD or SQUASH_MSG exists, check whether conflicts are resolved.
 * If resolved: finalize the commit. If still conflicted: abort and reset.
 *
 * Returns true if state was dirty and re-derivation is needed.
 */
export function reconcileMergeState(
  basePath: string,
  ctx: ExtensionContext,
): boolean {
  const mergeHeadPath = join(basePath, ".git", "MERGE_HEAD");
  const squashMsgPath = join(basePath, ".git", "SQUASH_MSG");
  const hasMergeHead = existsSync(mergeHeadPath);
  const hasSquashMsg = existsSync(squashMsgPath);
  if (!hasMergeHead && !hasSquashMsg) return false;

  const conflictedFiles = nativeConflictFiles(basePath);
  if (conflictedFiles.length === 0) {
    // All conflicts resolved — finalize the merge/squash commit
    try {
      nativeCommit(basePath, ""); // --no-edit equivalent: use empty message placeholder
      const mode = hasMergeHead ? "merge" : "squash commit";
      ctx.ui.notify(`Finalized leftover ${mode} from prior session.`, "info");
    } catch {
      // Commit may already exist; non-fatal
    }
  } else {
    // Still conflicted — try auto-resolving .gsd/ state file conflicts (#530)
    const gsdConflicts = conflictedFiles.filter((f) => f.startsWith(".gsd/"));
    const codeConflicts = conflictedFiles.filter((f) => !f.startsWith(".gsd/"));

    if (gsdConflicts.length > 0 && codeConflicts.length === 0) {
      // All conflicts are in .gsd/ state files — auto-resolve by accepting theirs
      let resolved = true;
      try {
        nativeCheckoutTheirs(basePath, gsdConflicts);
        nativeAddPaths(basePath, gsdConflicts);
      } catch {
        resolved = false;
      }
      if (resolved) {
        try {
          nativeCommit(
            basePath,
            "chore: auto-resolve .gsd/ state file conflicts",
          );
          ctx.ui.notify(
            `Auto-resolved ${gsdConflicts.length} .gsd/ state file conflict(s) from prior merge.`,
            "info",
          );
        } catch {
          resolved = false;
        }
      }
      if (!resolved) {
        if (hasMergeHead) {
          try {
            nativeMergeAbort(basePath);
          } catch {
            /* best-effort */
          }
        } else if (hasSquashMsg) {
          try {
            unlinkSync(squashMsgPath);
          } catch {
            /* best-effort */
          }
        }
        try {
          nativeResetHard(basePath);
        } catch {
          /* best-effort */
        }
        ctx.ui.notify(
          "Detected leftover merge state — auto-resolve failed, cleaned up. Re-deriving state.",
          "warning",
        );
      }
    } else {
      // Code conflicts present — abort and reset
      if (hasMergeHead) {
        try {
          nativeMergeAbort(basePath);
        } catch {
          /* best-effort */
        }
      } else if (hasSquashMsg) {
        try {
          unlinkSync(squashMsgPath);
        } catch {
          /* best-effort */
        }
      }
      try {
        nativeResetHard(basePath);
      } catch {
        /* best-effort */
      }
      ctx.ui.notify(
        "Detected leftover merge state with unresolved conflicts — cleaned up. Re-deriving state.",
        "warning",
      );
    }
  }
  return true;
}

// selfHealRuntimeRecords removed (D-05) — engine is authoritative, no stale record cleanup needed

// ─── Loop Remediation ─────────────────────────────────────────────────────────

/**
 * Build concrete, manual remediation steps for a loop-detected unit failure.
 * These are shown when automatic reconciliation is not possible.
 */
export function buildLoopRemediationSteps(
  unitType: string,
  unitId: string,
  base: string,
): string | null {
  const parts = unitId.split("/");
  const mid = parts[0];
  const sid = parts[1];
  const tid = parts[2];
  switch (unitType) {
    case "execute-task": {
      if (!mid || !sid || !tid) break;
      const planRel = relSliceFile(base, mid, sid, "PLAN");
      const summaryRel = relTaskFile(base, mid, sid, tid, "SUMMARY");
      return [
        `   1. Write ${summaryRel} (even a partial summary is sufficient to unblock the pipeline)`,
        `   2. Mark ${tid} [x] in ${planRel}: change "- [ ] **${tid}:" → "- [x] **${tid}:"`,
        `   3. Run \`gsd doctor\` to reconcile .gsd/ state`,
        `   4. Resume auto-mode — it will pick up from the next task`,
      ].join("\n");
    }
    case "plan-slice":
    case "research-slice": {
      if (!mid || !sid) break;
      const artifactRel =
        unitType === "plan-slice"
          ? relSliceFile(base, mid, sid, "PLAN")
          : relSliceFile(base, mid, sid, "RESEARCH");
      return [
        `   1. Write ${artifactRel} manually (or with the LLM in interactive mode)`,
        `   2. Run \`gsd doctor\` to reconcile .gsd/ state`,
        `   3. Resume auto-mode`,
      ].join("\n");
    }
    case "complete-slice": {
      if (!mid || !sid) break;
      return [
        `   1. Write the slice summary and UAT file for ${sid} in ${relSlicePath(base, mid, sid)}`,
        `   2. Mark ${sid} [x] in ${relMilestoneFile(base, mid, "ROADMAP")}`,
        `   3. Run \`gsd doctor\` to reconcile .gsd/ state`,
        `   4. Resume auto-mode`,
      ].join("\n");
    }
    case "validate-milestone": {
      if (!mid) break;
      const artifactRel = relMilestoneFile(base, mid, "VALIDATION");
      return [
        `   1. Write ${artifactRel} with verdict: pass`,
        `   2. Run \`gsd doctor\``,
        `   3. Resume auto-mode`,
      ].join("\n");
    }
    default:
      break;
  }
  return null;
}
