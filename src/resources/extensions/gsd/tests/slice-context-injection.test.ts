/**
 * Regression test: S##-CONTEXT.md from slice discussion is injected into
 * downstream prompt builders (#3452).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildCompleteSlicePrompt,
  buildPlanSlicePrompt,
  buildReassessRoadmapPrompt,
  buildReplanSlicePrompt,
  buildResearchSlicePrompt,
} from "../auto-prompts.ts";

function makeSliceContextFixture(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-slice-context-"));
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  const sliceDir = join(milestoneDir, "slices", "S01");
  mkdirSync(join(sliceDir, "tasks"), { recursive: true });
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Context Injection",
      "",
      "## Slices",
      "- [ ] **S01: Context-heavy slice** `risk:low`",
      "  Demo: context appears in prompts.",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(join(milestoneDir, "M001-CONTEXT.md"), "# M001 Context\n", "utf-8");
  writeFileSync(
    join(sliceDir, "S01-CONTEXT.md"),
    "# Slice Context\n\nUnique slice context marker: SLICE-CONTEXT-3452\n",
    "utf-8",
  );
  writeFileSync(
    join(sliceDir, "S01-PLAN.md"),
    [
      "# S01: Context-heavy slice",
      "",
      "**Goal:** Test context injection.",
      "**Demo:** Prompt contains the marker.",
      "",
      "## Tasks",
      "- [ ] **T01: Task** `est:10m`",
    ].join("\n"),
    "utf-8",
  );
  return base;
}

describe("slice CONTEXT.md injection into prompt builders (#3452)", () => {
  const builders: Array<[string, (base: string) => Promise<string>]> = [
    ["buildResearchSlicePrompt", (base) => buildResearchSlicePrompt("M001", "Context Injection", "S01", "Context-heavy slice", base)],
    ["buildPlanSlicePrompt", (base) => buildPlanSlicePrompt("M001", "Context Injection", "S01", "Context-heavy slice", base)],
    ["buildCompleteSlicePrompt", (base) => buildCompleteSlicePrompt("M001", "Context Injection", "S01", "Context-heavy slice", base)],
    ["buildReplanSlicePrompt", (base) => buildReplanSlicePrompt("M001", "Context Injection", "S01", "Context-heavy slice", base)],
    ["buildReassessRoadmapPrompt", (base) => buildReassessRoadmapPrompt("M001", "Context Injection", "S01", base)],
  ];

  for (const [name, build] of builders) {
    test(`${name} includes slice discussion context`, async () => {
      const base = makeSliceContextFixture();
      try {
        const prompt = await build(base);
        assert.match(prompt, /Slice Context/);
        assert.match(prompt, /SLICE-CONTEXT-3452/);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  }
});
