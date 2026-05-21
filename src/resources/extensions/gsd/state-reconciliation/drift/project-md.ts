// Project/App: GSD-2
// File Purpose: ADR-017 unregistered-milestone drift handler. Detects
// milestones whose on-disk directory has meaningful content (ROADMAP/
// CONTEXT/SUMMARY) but no DB row, then fails closed with an explicit recovery
// instruction. Markdown hierarchy import is reserved for operator-controlled
// migration/recovery commands, not automatic runtime reconciliation.

import { existsSync } from "node:fs";

import { getMilestone, isDbAvailable } from "../../gsd-db.js";
import { findMilestoneIds } from "../../milestone-ids.js";
import { resolveMilestoneFile } from "../../paths.js";
import type { GSDState } from "../../types.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

type UnregisteredMilestoneDrift = Extract<
  DriftRecord,
  { kind: "unregistered-milestone" }
>;

function milestoneHasContent(basePath: string, milestoneId: string): boolean {
  const roadmap = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
  const context = resolveMilestoneFile(basePath, milestoneId, "CONTEXT");
  const summary = resolveMilestoneFile(basePath, milestoneId, "SUMMARY");
  return (
    (roadmap !== null && existsSync(roadmap)) ||
    (context !== null && existsSync(context)) ||
    (summary !== null && existsSync(summary))
  );
}

export function detectUnregisteredMilestoneDrift(
  _state: GSDState,
  ctx: DriftContext,
): UnregisteredMilestoneDrift[] {
  if (!isDbAvailable()) return [];

  const drifts: UnregisteredMilestoneDrift[] = [];
  for (const milestoneId of findMilestoneIds(ctx.basePath)) {
    if (getMilestone(milestoneId)) continue;
    if (!milestoneHasContent(ctx.basePath, milestoneId)) continue;
    drifts.push({ kind: "unregistered-milestone", milestoneId });
  }
  return drifts;
}

/**
 * Repair intentionally fails closed. The project-root DB is authoritative at
 * runtime; markdown-only milestones must be imported through an explicit
 * migration/recovery command so operators opt into changing canonical state.
 */
export function repairUnregisteredMilestone(
  record: UnregisteredMilestoneDrift,
  _ctx: DriftContext,
): void {
  throw new Error(
    `Milestone ${record.milestoneId} exists only as markdown projection. ` +
      "Runtime reconciliation will not import markdown into the authoritative DB; run explicit GSD recovery/migration if this markdown should repopulate the database.",
  );
}

export const unregisteredMilestoneHandler: DriftHandler<UnregisteredMilestoneDrift> = {
  kind: "unregistered-milestone",
  detect: detectUnregisteredMilestoneDrift,
  repair: repairUnregisteredMilestone,
};
