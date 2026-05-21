// Project/App: GSD-2
// File Purpose: Block new workflow entry when completed milestone branches are still unmerged.

import {
  nativeBranchExists,
  nativeDetectMainBranch,
  nativeDiffNumstat,
} from "./native-git-bridge.js";
import { autoWorktreeBranch } from "./auto-worktree.js";
import { ensureDbOpen } from "./bootstrap/dynamic-tools.js";
import { getAllMilestones } from "./gsd-db.js";
import { resolveMilestoneIntegrationBranch } from "./git-service.js";
import { loadEffectiveGSDPreferences } from "./preferences.js";
import { captureRootDirtySnapshot, type RootDirtyEntry } from "./root-write-leak-guard.js";
import { isClosedStatus } from "./status-guards.js";

export interface UnmergedMilestoneBlocker {
  milestoneId: string;
  branch: string;
  integrationBranch: string;
  files: string[];
  dirtyOverlap: RootDirtyEntry[];
}

const ALLOWED_COMMANDS = new Set([
  "help",
  "h",
  "?",
  "status",
  "logs",
  "notifications",
  "inspect",
  "doctor",
  "park",
  "worktree",
  "wt",
]);

function isRuntimePath(path: string): boolean {
  return path === ".gsd" || path.startsWith(".gsd/");
}

function formatCommandLabel(attemptedCommand: string): string {
  const trimmed = attemptedCommand.trim();
  return trimmed ? `/gsd ${trimmed}` : "/gsd";
}

function resolveIntegrationBranch(base: string, milestoneId: string): string | null {
  const prefs = loadEffectiveGSDPreferences(base)?.preferences?.git ?? {};
  const resolution = resolveMilestoneIntegrationBranch(base, milestoneId, prefs);
  if (resolution.effectiveBranch && nativeBranchExists(base, resolution.effectiveBranch)) {
    return resolution.effectiveBranch;
  }

  try {
    const detected = nativeDetectMainBranch(base);
    if (detected && nativeBranchExists(base, detected)) return detected;
  } catch {
    // No reliable integration branch; leave this milestone unclassified.
  }

  return null;
}

export function isUnmergedMilestoneAllowedCommand(trimmed: string): boolean {
  const command = trimmed.trim();
  if (!command) return false;

  const [name, subcommand] = command.split(/\s+/, 2);
  if (name === "dispatch") {
    return subcommand === "complete" || subcommand === "complete-milestone";
  }
  return ALLOWED_COMMANDS.has(name);
}

export async function findUnmergedCompletedMilestones(base: string): Promise<UnmergedMilestoneBlocker[]> {
  await ensureDbOpen(base);

  const blockers: UnmergedMilestoneBlocker[] = [];
  const dirtyByPath = captureRootDirtySnapshot(base);

  for (const milestone of getAllMilestones()) {
    if (!isClosedStatus(milestone.status)) continue;

    const branch = autoWorktreeBranch(milestone.id);
    if (!nativeBranchExists(base, branch)) continue;

    const integrationBranch = resolveIntegrationBranch(base, milestone.id);
    if (!integrationBranch || integrationBranch === branch) continue;

    const files = nativeDiffNumstat(base, integrationBranch, branch)
      .map((entry) => entry.path)
      .filter((path) => path && !isRuntimePath(path));
    const uniqueFiles = [...new Set(files)].sort();
    if (uniqueFiles.length === 0) continue;

    blockers.push({
      milestoneId: milestone.id,
      branch,
      integrationBranch,
      files: uniqueFiles,
      dirtyOverlap: uniqueFiles
        .map((path) => dirtyByPath.get(path))
        .filter((entry): entry is RootDirtyEntry => Boolean(entry)),
    });
  }

  return blockers;
}

export function formatUnmergedMilestoneBlockMessage(
  blocker: UnmergedMilestoneBlocker,
  attemptedCommand = "",
): string {
  const commandLabel = formatCommandLabel(attemptedCommand);
  const fileList = blocker.files.map((path) => `  - ${path}`).join("\n");
  const dirtyOverlap = blocker.dirtyOverlap.length > 0
    ? [
        "",
        "Project-root dirty files overlap that milestone branch:",
        ...blocker.dirtyOverlap.map((entry) => `  ${entry.status.padEnd(2)} ${entry.path}`),
      ]
    : [];

  return [
    `${commandLabel} cannot start new workflow work because ${blocker.milestoneId} is complete but not merged.`,
    "",
    `Branch: ${blocker.branch}`,
    `Target: ${blocker.integrationBranch}`,
    "Unmerged product files:",
    fileList,
    ...dirtyOverlap,
    "",
    "Fix:",
    blocker.dirtyOverlap.length > 0
      ? "  1. Commit, stash, or discard the overlapping project-root files."
      : "  1. Review the unmerged milestone branch.",
    `  2. Run /gsd dispatch complete-milestone ${blocker.milestoneId} to complete the preserved milestone merge.`,
    `  3. After ${blocker.milestoneId} is merged, run /gsd again.`,
  ].join("\n");
}

export async function getUnmergedMilestoneBlockMessageForBase(
  base: string,
  attemptedCommand = "",
): Promise<string | null> {
  const blockers = await findUnmergedCompletedMilestones(base);
  if (blockers.length === 0) return null;
  return formatUnmergedMilestoneBlockMessage(blockers[0], attemptedCommand);
}
