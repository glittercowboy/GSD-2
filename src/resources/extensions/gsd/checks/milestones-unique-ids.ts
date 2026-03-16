/**
 * CI check: verify all committed GSD milestones use unique IDs (M001-abc123).
 *
 * Uses findMilestoneIds() and parseMilestoneId() from GSD's own guided-flow.ts
 * so the check stays in sync with any future changes to ID parsing or format.
 *
 * Exit 0 = all milestones have unique suffixes (or no milestones exist).
 * Exit 1 = one or more milestones use bare IDs without a unique suffix.
 */

import { findMilestoneIds, parseMilestoneId } from "../guided-flow.js";

const basePath = process.cwd();
const milestoneIds = findMilestoneIds(basePath);

if (milestoneIds.length === 0) {
  console.log("✓ No GSD milestones found — nothing to check.");
  process.exit(0);
}

const bare = milestoneIds.filter((id) => !parseMilestoneId(id).suffix);

if (bare.length === 0) {
  console.log(`✓ All ${milestoneIds.length} GSD milestone(s) use unique IDs.`);
  process.exit(0);
}

console.error(
  `✗ ${bare.length} of ${milestoneIds.length} milestone(s) use bare IDs without a unique suffix:\n`,
);
for (const id of bare) {
  console.error(`  ${id}  →  expected format: ${id}-<6chars> (e.g. ${id}-a1b2c3)`);
}
console.error(
  "\nRun the GSD migration to assign unique IDs: /gsd migrate",
);

process.exit(1);
