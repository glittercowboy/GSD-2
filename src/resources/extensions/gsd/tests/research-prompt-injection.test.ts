/**
 * Tests for research depth/focus injection into the research-milestone prompt.
 *
 * Validates that buildResearchMilestonePrompt reads CONTEXT.md frontmatter
 * via parseResearchDepth and injects researchDepth/researchFocus template
 * vars into the rendered research-milestone.md prompt. Also validates that
 * the prompt template itself contains the expected deep-tier instructions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { buildResearchMilestonePrompt } from "../auto-prompts.ts";
import { clearPathCache } from "../paths.ts";
import { clearParseCache } from "../files.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-prompt-inject-${randomUUID()}`);
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  clearPathCache();
  clearParseCache();
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

function writeMilestoneContext(base: string, mid: string, content: string): void {
  const dir = join(base, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT.md`), content);
}

// Resolve the prompts directory relative to this test file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsDir = join(__dirname, "..", "prompts");

// ─── Tests: Prompt template content ───────────────────────────────────────

test("research-milestone.md contains deep-tier instructions referencing subagent", () => {
  const content = readFileSync(join(promptsDir, "research-milestone.md"), "utf-8");
  assert.ok(
    content.includes("subagent"),
    "research-milestone.md should reference subagent tool for deep-tier research"
  );
  assert.ok(
    content.includes("Codebase agent"),
    "Deep-tier should list Codebase agent"
  );
  assert.ok(
    content.includes("Technology agent"),
    "Deep-tier should list Technology agent"
  );
  assert.ok(
    content.includes("Industry agent"),
    "Deep-tier should list Industry agent"
  );
  assert.ok(
    content.includes("Academic agent"),
    "Deep-tier should list Academic agent"
  );
  assert.ok(
    content.includes("Community agent"),
    "Deep-tier should list Community agent"
  );
});

test("research-milestone.md contains graceful fallback when subagent is unavailable", () => {
  const content = readFileSync(join(promptsDir, "research-milestone.md"), "utf-8");
  assert.ok(
    content.includes("`subagent` is not available"),
    "Should reference fallback when subagent is not available"
  );
  assert.ok(
    content.includes("sequential multi-pass"),
    "Should mention sequential multi-pass as fallback strategy"
  );
});

test("research-milestone.md contains all four depth tiers (deep/standard/light/empty)", () => {
  const content = readFileSync(join(promptsDir, "research-milestone.md"), "utf-8");
  assert.ok(content.includes("research depth is `deep`"), "Should have deep tier");
  assert.ok(content.includes("research depth is `standard`"), "Should have standard tier");
  assert.ok(content.includes("research depth is `light`"), "Should have light tier");
  assert.ok(content.includes("research depth is empty or not set"), "Should have empty/unset tier");
});

test("research-milestone.md contains user confirmation instruction for deep tier", () => {
  const content = readFileSync(join(promptsDir, "research-milestone.md"), "utf-8");
  assert.ok(
    content.includes("briefly explain to the user"),
    "Deep tier should instruct user confirmation before proceeding"
  );
  assert.ok(
    content.includes("token cost"),
    "Deep tier should mention token cost visibility"
  );
});

test("research-milestone.md contains researchDepth and researchFocus template vars", () => {
  const content = readFileSync(join(promptsDir, "research-milestone.md"), "utf-8");
  assert.ok(
    content.includes("{{researchDepth}}"),
    "Template should contain {{researchDepth}} placeholder"
  );
  assert.ok(
    content.includes("{{researchFocus}}"),
    "Template should contain {{researchFocus}} placeholder"
  );
});

// ─── Tests: buildResearchMilestonePrompt injection ────────────────────────

test("buildResearchMilestonePrompt injects researchDepth and researchFocus from CONTEXT.md frontmatter", async () => {
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", [
      "---",
      "research_depth: deep",
      'research_focus: "authentication patterns"',
      "---",
      "# Test Milestone",
      "Some context content.",
    ].join("\n"));

    const result = await buildResearchMilestonePrompt("M001", "Test Milestone", base);

    // The template vars should be resolved — depth and focus values appear in the output
    assert.ok(
      result.includes("deep"),
      "Rendered prompt should contain the research depth value 'deep'"
    );
    assert.ok(
      result.includes("authentication patterns"),
      "Rendered prompt should contain the research focus value"
    );
    // No unresolved template vars
    assert.ok(
      !result.includes("{{researchDepth}}"),
      "No literal {{researchDepth}} should remain in rendered output"
    );
    assert.ok(
      !result.includes("{{researchFocus}}"),
      "No literal {{researchFocus}} should remain in rendered output"
    );
  } finally {
    cleanup(base);
  }
});

test("buildResearchMilestonePrompt resolves template vars to empty string when CONTEXT.md has no research frontmatter", async () => {
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", [
      "---",
      "id: M001",
      "title: Test Milestone",
      "---",
      "# Test Milestone",
      "Some context content without research depth.",
    ].join("\n"));

    const result = await buildResearchMilestonePrompt("M001", "Test Milestone", base);

    // No stale template var literals in the output
    assert.ok(
      !result.includes("{{researchDepth}}"),
      "No literal {{researchDepth}} should remain when frontmatter is absent"
    );
    assert.ok(
      !result.includes("{{researchFocus}}"),
      "No literal {{researchFocus}} should remain when frontmatter is absent"
    );
    // The prompt should still render correctly — check for known content
    assert.ok(
      result.includes("Research Milestone"),
      "Prompt should still contain Research Milestone heading"
    );
  } finally {
    cleanup(base);
  }
});

test("buildResearchMilestonePrompt resolves template vars when CONTEXT.md does not exist", async () => {
  const base = makeTmpBase();
  try {
    // No CONTEXT.md written — just an empty milestone dir
    mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });

    const result = await buildResearchMilestonePrompt("M001", "Test Milestone", base);

    // No stale template var literals
    assert.ok(
      !result.includes("{{researchDepth}}"),
      "No literal {{researchDepth}} should remain when CONTEXT.md is missing"
    );
    assert.ok(
      !result.includes("{{researchFocus}}"),
      "No literal {{researchFocus}} should remain when CONTEXT.md is missing"
    );
  } finally {
    cleanup(base);
  }
});

test("buildResearchMilestonePrompt includes Research Depth Calibration section", async () => {
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", [
      "---",
      "research_depth: standard",
      "---",
      "# Test Milestone",
    ].join("\n"));

    const result = await buildResearchMilestonePrompt("M001", "Test Milestone", base);

    assert.ok(
      result.includes("Research Depth Calibration"),
      "Rendered prompt should include the Research Depth Calibration section"
    );
    assert.ok(
      result.includes("standard"),
      "Rendered prompt should include the depth value 'standard'"
    );
  } finally {
    cleanup(base);
  }
});
