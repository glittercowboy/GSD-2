/**
 * Worktree ↔ project root state synchronization.
 *
 * When auto-mode runs inside a worktree, dispatch-critical state files
 * need to be synced back to the project root so that:
 * - A restart from the project root sees current progress
 * - /gsd status from another terminal reads accurate state
 * - completed-units.json is the union of both locations
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { join } from "node:path";

/**
 * Sync dispatch-critical .gsd/ state from worktree to project root.
 * Non-fatal — sync failure should never block dispatch.
 *
 * Syncs: STATE.md, milestone directory, completed-units.json, runtime records.
 */
export function syncStateToProjectRoot(
  worktreePath: string,
  projectRoot: string,
  milestoneId: string | null,
): void {
  if (!worktreePath || !projectRoot || worktreePath === projectRoot) return;
  if (!milestoneId) return;

  const wtGsd = join(worktreePath, ".gsd");
  const prGsd = join(projectRoot, ".gsd");

  // 1. STATE.md — the quick-glance status used by initial deriveState()
  try {
    const src = join(wtGsd, "STATE.md");
    const dst = join(prGsd, "STATE.md");
    if (existsSync(src)) cpSync(src, dst, { force: true });
  } catch { /* non-fatal */ }

  // 2. Milestone directory — ROADMAP, slice PLANs, task summaries
  try {
    const srcMilestone = join(wtGsd, "milestones", milestoneId);
    const dstMilestone = join(prGsd, "milestones", milestoneId);
    if (existsSync(srcMilestone)) {
      mkdirSync(dstMilestone, { recursive: true });
      cpSync(srcMilestone, dstMilestone, { recursive: true, force: true });
    }
  } catch { /* non-fatal */ }

  // 3. Merge completed-units.json (set-union)
  const srcKeysFile = join(wtGsd, "completed-units.json");
  const dstKeysFile = join(prGsd, "completed-units.json");
  if (existsSync(srcKeysFile)) {
    try {
      const srcKeys: string[] = JSON.parse(readFileSync(srcKeysFile, "utf8"));
      let dstKeys: string[] = [];
      if (existsSync(dstKeysFile)) {
        try { dstKeys = JSON.parse(readFileSync(dstKeysFile, "utf8")); } catch { /* ignore corrupt */ }
      }
      const merged = [...new Set([...dstKeys, ...srcKeys])];
      writeFileSync(dstKeysFile, JSON.stringify(merged, null, 2));
    } catch { /* non-fatal */ }
  }

  // 4. Runtime records — unit dispatch state
  try {
    const srcRuntime = join(wtGsd, "runtime", "units");
    const dstRuntime = join(prGsd, "runtime", "units");
    if (existsSync(srcRuntime)) {
      mkdirSync(dstRuntime, { recursive: true });
      cpSync(srcRuntime, dstRuntime, { recursive: true, force: true });
    }
  } catch { /* non-fatal */ }
}

/**
 * Clean stale runtime unit files for completed milestones.
 *
 * After restart, stale runtime/units/*.json from prior milestones can
 * cause deriveState to resume the wrong milestone (#887). Removes files
 * for milestones that have a SUMMARY (fully complete).
 */
export function cleanStaleRuntimeUnits(
  basePath: string,
  gsdRootPath: string,
  hasMilestoneSummary: (mid: string) => boolean,
): number {
  const runtimeUnitsDir = join(gsdRootPath, "runtime", "units");
  if (!existsSync(runtimeUnitsDir)) return 0;

  let cleaned = 0;
  try {
    const { readdirSync, unlinkSync } = require("node:fs");
    for (const file of readdirSync(runtimeUnitsDir)) {
      if (!file.endsWith(".json")) continue;
      const midMatch = file.match(/(M\d+(?:-[a-z0-9]{6})?)/);
      if (!midMatch) continue;
      if (hasMilestoneSummary(midMatch[1])) {
        try {
          unlinkSync(join(runtimeUnitsDir, file));
          cleaned++;
        } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }
  return cleaned;
}

/**
 * Check if managed resources have been updated since session start.
 * Returns a message if stale, null otherwise.
 */
export function checkResourcesStale(syncedAtOnStart: number | null): string | null {
  if (syncedAtOnStart === null) return null;
  const current = readResourceSyncedAt();
  if (current === null) return null;
  if (current !== syncedAtOnStart) {
    return "GSD resources were updated since this session started. Restart gsd to load the new code.";
  }
  return null;
}

/**
 * Read the resource sync timestamp from the managed-resources manifest.
 */
export function readResourceSyncedAt(): number | null {
  const { homedir } = require("node:os");
  const agentDir = process.env.GSD_CODING_AGENT_DIR || join(homedir(), ".gsd", "agent");
  const manifestPath = join(agentDir, "managed-resources.json");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return typeof manifest?.syncedAt === "number" ? manifest.syncedAt : null;
  } catch {
    return null;
  }
}
