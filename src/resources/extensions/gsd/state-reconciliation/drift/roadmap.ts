// Project/App: GSD-2
// File Purpose: ADR-017 roadmap-divergence drift handler. Detects mismatches
// between ROADMAP.md (parsed slice sequence, depends declarations, and
// checkboxes) and the DB slice rows for that milestone, then re-renders the
// ROADMAP projection from the authoritative DB rows.

import { existsSync, readFileSync } from "node:fs";

import {
  getMilestone,
  getMilestoneSlices,
  isDbAvailable,
} from "../../gsd-db.js";
import { renderRoadmapFromDb } from "../../markdown-renderer.js";
import { findMilestoneIds } from "../../milestone-ids.js";
import { parseRoadmap } from "../../parsers-legacy.js";
import { resolveMilestoneFile } from "../../paths.js";
import { isClosedStatus } from "../../status-guards.js";
import type { GSDState } from "../../types.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

type RoadmapDivergenceDrift = Extract<
  DriftRecord,
  { kind: "roadmap-divergence" }
>;

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function milestoneHasDivergence(
  basePath: string,
  milestoneId: string,
): boolean {
  const roadmapPath = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
  if (!roadmapPath || !existsSync(roadmapPath)) return false;

  let roadmap: ReturnType<typeof parseRoadmap>;
  try {
    roadmap = parseRoadmap(readFileSync(roadmapPath, "utf-8"));
  } catch {
    return false;
  }

  const dbSlices = getMilestoneSlices(milestoneId);
  const dbSliceMap = new Map(dbSlices.map((s) => [s.id, s]));
  const roadmapSliceIds = new Set<string>();

  for (let i = 0; i < roadmap.slices.length; i++) {
    const roadmapSlice = roadmap.slices[i]!;
    roadmapSliceIds.add(roadmapSlice.id);
    const expectedSequence = i + 1;
    const dbSlice = dbSliceMap.get(roadmapSlice.id);
    if (!dbSlice) return true; // Roadmap has a slice the DB doesn't.
    if (dbSlice.sequence !== expectedSequence) return true;
    if (!arraysEqual(dbSlice.depends, roadmapSlice.depends)) return true;
    if (isClosedStatus(dbSlice.status) !== roadmapSlice.done) return true;
  }
  for (const dbSlice of dbSlices) {
    if (!roadmapSliceIds.has(dbSlice.id)) return true;
  }
  return false;
}

export function detectRoadmapDivergenceDrift(
  _state: GSDState,
  ctx: DriftContext,
): RoadmapDivergenceDrift[] {
  if (!isDbAvailable()) return [];

  const drifts: RoadmapDivergenceDrift[] = [];
  for (const milestoneId of findMilestoneIds(ctx.basePath)) {
    // Skip milestones that don't yet have a DB row — that's the
    // unregistered-milestone drift handler's responsibility.
    if (!getMilestone(milestoneId)) continue;
    if (milestoneHasDivergence(ctx.basePath, milestoneId)) {
      drifts.push({ kind: "roadmap-divergence", milestoneId });
    }
  }
  return drifts;
}

/**
 * Repair a milestone's roadmap divergence by regenerating the projection from
 * DB rows. ROADMAP.md is a projection; runtime reconciliation must not import
 * slice presence, sequence, dependencies, or checkbox state from markdown.
 */
export async function repairRoadmapDivergence(
  record: RoadmapDivergenceDrift,
  ctx: DriftContext,
): Promise<void> {
  await renderRoadmapFromDb(ctx.basePath, record.milestoneId);
}

export const roadmapDivergenceHandler: DriftHandler<RoadmapDivergenceDrift> = {
  kind: "roadmap-divergence",
  detect: detectRoadmapDivergenceDrift,
  repair: repairRoadmapDivergence,
};
