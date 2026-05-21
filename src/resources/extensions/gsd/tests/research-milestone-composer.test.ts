// GSD-2 — #4782 phase 3 batch 2: research-milestone migrated through composer.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildResearchMilestonePrompt } from "../auto-prompts.ts";
import { invalidateAllCaches } from "../cache.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  upsertMilestonePlanning,
  insertArtifact,
} from "../gsd-db.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-research-ms-composer-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  invalidateAllCaches();
  rmSync(base, { recursive: true, force: true });
}

function seed(base: string, mid: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: mid, title: "Research Test", status: "active", depends_on: [] });
  upsertMilestonePlanning(mid, {
    title: "Research Test",
    status: "active",
    vision: "Research composer migration",
    successCriteria: ["Prompt compiles"],
    keyRisks: [],
    proofStrategy: [],
    verificationContract: "",
    verificationIntegration: "",
    verificationOperational: "",
    verificationUat: "",
    definitionOfDone: [],
    requirementCoverage: "",
    boundaryMapMarkdown: "",
  });
}

test("#4782 phase 3: buildResearchMilestonePrompt emits milestone-context then research template via composer", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seed(base, "M001");

  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
    "# M001 Context\n\nA research test milestone.\n",
  );

  const prompt = await buildResearchMilestonePrompt("M001", "Research Test", base);

  // Context wrapper present
  assert.match(prompt, /## Inlined Context \(preloaded — do not re-read these files\)/);

  // Milestone context inlined first (manifest order)
  assert.match(prompt, /### Milestone Context/);
  assert.match(prompt, /A research test milestone/);

  // Research template inlined as the templates artifact
  assert.match(prompt, /### Output Template: Research/);

  // Ordering: milestone-context precedes the research template
  const contextIdx = prompt.indexOf("### Milestone Context");
  const researchIdx = prompt.indexOf("### Output Template: Research");
  assert.ok(contextIdx > -1 && researchIdx > contextIdx,
    `milestone-context (${contextIdx}) must precede research template (${researchIdx})`);
});

test("buildResearchMilestonePrompt keeps broad project docs on-demand", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seed(base, "M001");
  writeFileSync(join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"), "# M001 Context\n");
  insertArtifact({
    path: "PROJECT.md",
    artifact_type: "project",
    milestone_id: null,
    slice_id: null,
    task_id: null,
    full_content: "# Project\n\nResearch composer fixture project.\n",
  });
  insertArtifact({
    path: "REQUIREMENTS.md",
    artifact_type: "requirements",
    milestone_id: null,
    slice_id: null,
    task_id: null,
    full_content: "# Requirements\n\nResearch composer fixture requirements.\n",
  });
  insertArtifact({
    path: "DECISIONS.md",
    artifact_type: "decisions",
    milestone_id: null,
    slice_id: null,
    task_id: null,
    full_content: "# Decisions\n\nResearch composer fixture decisions.\n",
  });

  const prompt = await buildResearchMilestonePrompt("M001", "Research Test", base);

  const contextIdx = prompt.indexOf("### Milestone Context");
  const researchIdx = prompt.indexOf("### Output Template: Research");
  const onDemandIdx = prompt.indexOf("### On-demand Planning Context");
  assert.ok(contextIdx > -1, "milestone-context block missing");
  assert.ok(researchIdx > -1, "research template block missing");
  assert.ok(onDemandIdx > -1, "on-demand planning context missing");
  assert.ok(
    contextIdx < researchIdx && researchIdx < onDemandIdx,
    `manifest order violated: milestone-context (${contextIdx}) < research-template (${researchIdx}) < on-demand (${onDemandIdx})`,
  );
  assert.doesNotMatch(prompt, /Research composer fixture project/);
  assert.doesNotMatch(prompt, /Research composer fixture requirements/);
  assert.doesNotMatch(prompt, /Research composer fixture decisions/);
  assert.match(prompt, /`\.gsd\/PROJECT\.md`/);
  assert.match(prompt, /`\.gsd\/REQUIREMENTS\.md`/);
  assert.match(prompt, /`\.gsd\/DECISIONS\.md`/);
});
