// GSD-2 — Guided smart entry draft-state behavior tests.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { deriveState } from "../state.js";
import { resolveMilestoneFile } from "../paths.js";

function writeDraftOnlyMilestone(base: string): void {
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(
    join(milestoneDir, "M001-CONTEXT-DRAFT.md"),
    "# M001: Test Milestone\n\n**Status:** Draft\n\nSeed material.\n",
  );
}

test("deriveState returns needs-discussion for draft-only milestone", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-smart-entry-draft-"));
  try {
    writeDraftOnlyMilestone(base);
    const state = await deriveState(base);
    assert.equal(state.phase, "needs-discussion");
    assert.equal(state.activeMilestone?.id, "M001");
    assert.match(resolveMilestoneFile(base, "M001", "CONTEXT-DRAFT") ?? "", /M001-CONTEXT-DRAFT\.md$/);
    assert.equal(resolveMilestoneFile(base, "M001", "CONTEXT"), null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
