/**
 * Tests for D071 research_depth frontmatter dispatch override.
 *
 * Validates that CONTEXT.md's `research_depth` frontmatter overrides
 * the profile's `skip_research` / `skip_slice_research` settings in
 * both the research-milestone and research-slice dispatch rules.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { DISPATCH_RULES, type DispatchContext } from "../auto-dispatch.ts";
import type { GSDState } from "../types.ts";
import { clearPathCache } from "../paths.ts";
import { clearParseCache } from "../files.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-dispatch-override-${randomUUID()}`);
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

function writeMilestoneResearch(base: string, mid: string, content: string): void {
  const dir = join(base, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-RESEARCH.md`), content);
}

function writeSliceResearch(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, ".gsd", "milestones", mid, "slices", sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-RESEARCH.md`), content);
}

function findRule(name: string) {
  const rule = DISPATCH_RULES.find(r => r.name === name);
  if (!rule) throw new Error(`Dispatch rule "${name}" not found`);
  return rule;
}

function makePrePlanningState(): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Test" },
    activeSlice: null,
    activeTask: null,
    phase: "pre-planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "Research milestone M001.",
    registry: [{ id: "M001", title: "Test", status: "active" }],
    progress: { milestones: { done: 0, total: 1 } },
  };
}

function makePlanningState(): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Test" },
    activeSlice: { id: "S02", title: "Slice Two" },
    activeTask: null,
    phase: "planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "Research slice S02.",
    registry: [{ id: "M001", title: "Test", status: "active" }],
    progress: { milestones: { done: 0, total: 1 } },
  };
}

// ─── Tests: research-milestone rule ───────────────────────────────────────

const MILESTONE_RULE = "pre-planning (no research) → research-milestone";

test("research_depth: deep overrides skip_research: true → dispatches research-milestone", async () => {
  const rule = findRule(MILESTONE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nresearch_depth: deep\n---\n# Context\nSome context.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePrePlanningState(),
      prefs: { phases: { skip_research: true } } as any,
    };
    const result = await rule.match(ctx);
    assert.ok(result, "Expected dispatch, got null");
    assert.equal(result!.action, "dispatch");
    if (result!.action === "dispatch") {
      assert.equal(result!.unitType, "research-milestone");
    }
  } finally {
    cleanup(base);
  }
});

test("research_depth: skip + skip_research: true → returns null (frontmatter skip honored)", async () => {
  const rule = findRule(MILESTONE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nresearch_depth: skip\n---\n# Context\nSome context.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePrePlanningState(),
      prefs: { phases: { skip_research: true } } as any,
    };
    const result = await rule.match(ctx);
    assert.equal(result, null, "Expected null (skip honored)");
  } finally {
    cleanup(base);
  }
});

test("no research_depth frontmatter + skip_research: true → returns null (profile honored)", async () => {
  const rule = findRule(MILESTONE_RULE);
  const base = makeTmpBase();
  try {
    // CONTEXT.md exists but has no research_depth
    writeMilestoneContext(base, "M001", "---\nid: M001\n---\n# Context\nSome context.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePrePlanningState(),
      prefs: { phases: { skip_research: true } } as any,
    };
    const result = await rule.match(ctx);
    assert.equal(result, null, "Expected null (profile skip_research honored)");
  } finally {
    cleanup(base);
  }
});

test("research_depth: light + skip_research: false → dispatches (no conflict)", async () => {
  const rule = findRule(MILESTONE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nresearch_depth: light\n---\n# Context\nSome context.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePrePlanningState(),
      prefs: { phases: { skip_research: false } } as any,
    };
    const result = await rule.match(ctx);
    assert.ok(result, "Expected dispatch, got null");
    assert.equal(result!.action, "dispatch");
    if (result!.action === "dispatch") {
      assert.equal(result!.unitType, "research-milestone");
    }
  } finally {
    cleanup(base);
  }
});

test("research_depth: deep + research file already exists → returns null (file-existence check works)", async () => {
  const rule = findRule(MILESTONE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nresearch_depth: deep\n---\n# Context\nSome context.");
    writeMilestoneResearch(base, "M001", "# Research\nAlready done.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePrePlanningState(),
      prefs: { phases: { skip_research: true } } as any,
    };
    const result = await rule.match(ctx);
    assert.equal(result, null, "Expected null (research file already exists)");
  } finally {
    cleanup(base);
  }
});

test("research_depth: skip overrides even when skip_research is false (explicit skip wins)", async () => {
  const rule = findRule(MILESTONE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nresearch_depth: skip\n---\n# Context\nSome context.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePrePlanningState(),
      prefs: { phases: { skip_research: false } } as any,
    };
    const result = await rule.match(ctx);
    assert.equal(result, null, "Expected null (explicit skip overrides enabled research)");
  } finally {
    cleanup(base);
  }
});

// ─── Tests: research-slice rule ───────────────────────────────────────────

const SLICE_RULE = "planning (no research, not S01) → research-slice";

test("slice: research_depth: standard + skip_slice_research: true → dispatches research-slice", async () => {
  const rule = findRule(SLICE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nresearch_depth: standard\n---\n# Context\nSome context.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePlanningState(), // activeSlice = S02
      prefs: { phases: { skip_slice_research: true } } as any,
    };
    const result = await rule.match(ctx);
    assert.ok(result, "Expected dispatch, got null");
    assert.equal(result!.action, "dispatch");
    if (result!.action === "dispatch") {
      assert.equal(result!.unitType, "research-slice");
      assert.equal(result!.unitId, "M001/S02");
    }
  } finally {
    cleanup(base);
  }
});

test("slice: research_depth: deep + skip_research: true → dispatches research-slice", async () => {
  const rule = findRule(SLICE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nresearch_depth: deep\n---\n# Context\nSome context.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePlanningState(),
      prefs: { phases: { skip_research: true } } as any,
    };
    const result = await rule.match(ctx);
    assert.ok(result, "Expected dispatch, got null");
    assert.equal(result!.action, "dispatch");
    if (result!.action === "dispatch") {
      assert.equal(result!.unitType, "research-slice");
    }
  } finally {
    cleanup(base);
  }
});

test("slice: no research_depth + skip_slice_research: true → returns null (profile honored)", async () => {
  const rule = findRule(SLICE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nid: M001\n---\n# Context\nNo depth.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePlanningState(),
      prefs: { phases: { skip_slice_research: true } } as any,
    };
    const result = await rule.match(ctx);
    assert.equal(result, null, "Expected null (profile skip_slice_research honored)");
  } finally {
    cleanup(base);
  }
});

test("slice: research_depth: skip + skip_slice_research: false → returns null (explicit skip wins)", async () => {
  const rule = findRule(SLICE_RULE);
  const base = makeTmpBase();
  try {
    writeMilestoneContext(base, "M001", "---\nresearch_depth: skip\n---\n# Context\nSome context.");
    const ctx: DispatchContext = {
      basePath: base,
      mid: "M001",
      midTitle: "Test",
      state: makePlanningState(),
      prefs: { phases: {} } as any,
    };
    const result = await rule.match(ctx);
    assert.equal(result, null, "Expected null (explicit skip overrides enabled research)");
  } finally {
    cleanup(base);
  }
});
