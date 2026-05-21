// Project/App: GSD-2
// File Purpose: Behavior tests for the state-aware /gsd home menu.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildGsdHomeModel, showGsdHome } from "../gsd-command-home.ts";
import type { GSDState } from "../types.ts";

function baseState(overrides: Partial<GSDState> = {}): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Menu Cleanup" },
    activeSlice: { id: "S01", title: "Home Menu" },
    activeTask: { id: "T01", title: "Wire choices" },
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "Execute T01.",
    registry: [{ id: "M001", title: "Menu Cleanup", status: "active" }],
    requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 },
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 0, total: 1 },
      tasks: { done: 0, total: 1 },
    },
    ...overrides,
  };
}

function action(model: ReturnType<typeof buildGsdHomeModel>, id: string) {
  const match = model.actions.find((candidate) => candidate.id === id);
  assert.ok(match, `missing action ${id}`);
  return match;
}

test("/gsd home keeps the stable five user-intent choices", () => {
  const model = buildGsdHomeModel(baseState());

  assert.deepEqual(
    model.actions.map((candidate) => candidate.label),
    [
      "Continue one step",
      "Run automatically",
      "Review status",
      "Fix or recover",
      "Start or configure",
    ],
  );
});

test("/gsd home recommends step mode for active unblocked work", () => {
  const model = buildGsdHomeModel(baseState());

  assert.equal(action(model, "continue_step").recommended, true);
  assert.equal(action(model, "continue_step").enabled, true);
  assert.equal(action(model, "run_auto").enabled, true);
  assert.equal(action(model, "fix_recover").enabled, false);
});

test("/gsd home makes blockers the top state and disables advancing choices", () => {
  const model = buildGsdHomeModel(baseState({
    phase: "blocked",
    blockers: ["Milestone M001 is blocked because milestone validation returned needs-attention."],
    nextAction: "Resolve validation before proceeding.",
  }));

  assert.equal(action(model, "fix_recover").recommended, true);
  assert.equal(action(model, "fix_recover").enabled, true);
  assert.equal(action(model, "continue_step").enabled, false);
  assert.equal(action(model, "run_auto").enabled, false);
  assert.match(action(model, "continue_step").description, /Unavailable/);
});

test("/gsd home recommends start/configure after all milestones complete", () => {
  const model = buildGsdHomeModel(baseState({
    activeMilestone: null,
    activeSlice: null,
    activeTask: null,
    phase: "complete",
    nextAction: "All milestones complete.",
    lastCompletedMilestone: { id: "M001", title: "Menu Cleanup" },
    registry: [{ id: "M001", title: "Menu Cleanup", status: "complete" }],
    progress: { milestones: { done: 1, total: 1 } },
  }));

  assert.equal(action(model, "start_configure").recommended, true);
  assert.equal(action(model, "continue_step").enabled, false);
  assert.equal(action(model, "run_auto").enabled, false);
  assert.match(model.summary.join("\n"), /All milestones complete/);
});

test("showGsdHome renders the five-slot home text without an interactive TUI", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-home-"));
  const notifications: Array<{ message: string; level: string }> = [];
  try {
    const milestoneDir = join(base, ".gsd", "milestones", "M001");
    mkdirSync(milestoneDir, { recursive: true });
    writeFileSync(
      join(milestoneDir, "M001-ROADMAP.md"),
      [
        "# M001: Complete Milestone",
        "",
        "## Slices",
        "- [x] **S01: Done slice** `risk:low` `depends:[]`",
        "  > Done.",
      ].join("\n"),
    );
    writeFileSync(join(milestoneDir, "M001-SUMMARY.md"), "# M001 Summary\n\nComplete.");

    await showGsdHome(
      {
        hasUI: false,
        ui: {
          notify: (message: string, level: string) => notifications.push({ message, level }),
        },
      } as any,
      {} as any,
      base,
    );

    const message = notifications.at(-1)?.message ?? "";
    assert.match(message, /GSD — What now\?/);
    assert.match(message, /Continue one step/);
    assert.match(message, /Run automatically/);
    assert.match(message, /Review status/);
    assert.match(message, /Fix or recover/);
    assert.match(message, /Start or configure/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
