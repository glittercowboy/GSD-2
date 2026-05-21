// Project/App: GSD-2
// File Purpose: Regression tests for validation-blocked command gating.

import test from "node:test";
import assert from "node:assert/strict";

import {
  formatValidationBlockedMessage,
  isValidationBlockAllowedCommand,
  isValidationBlockedState,
} from "../validation-block-guard.ts";
import type { GSDState } from "../types.ts";

function blockedState(): GSDState {
  return {
    activeMilestone: { id: "M006", title: "Mark All Complete" },
    activeSlice: null,
    activeTask: null,
    phase: "blocked",
    recentDecisions: [],
    blockers: [
      [
        "Milestone M006 is blocked because milestone validation returned needs-attention.",
        "Fix options:",
        "1. Review the validation details: `/gsd status`",
        "2. If you fixed the missing evidence or issue, re-run milestone validation: `/gsd validate-milestone`",
        "3. If the finding is acceptable, override it: `/gsd verdict pass --rationale \"why this is okay\"`",
        "4. If this should wait, defer it explicitly: `/gsd park M006`",
      ].join("\n"),
    ],
    nextAction: "Resolve M006 validation attention before proceeding.",
    registry: [],
    requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 },
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 1, total: 1 },
    },
  };
}

test("validation block detection only matches validation blockers", () => {
  assert.equal(isValidationBlockedState(blockedState()), true);
  assert.equal(isValidationBlockedState({
    ...blockedState(),
    blockers: ["No slice eligible because dependencies are incomplete."],
  }), false);
});

test("validation block allows only recovery and inspection commands", () => {
  const allowed = [
    "help",
    "h",
    "?",
    "status",
    "verdict pass --rationale ok",
    "validate-milestone",
    "dispatch validate",
    "dispatch validate-milestone",
    "park M006",
    "logs debug",
    "notifications",
    "inspect",
    "doctor audit",
  ];

  for (const command of allowed) {
    assert.equal(isValidationBlockAllowedCommand(command), true, command);
  }
});

test("validation block rejects workflow-start and advancing commands", () => {
  const blocked = [
    "",
    "auto",
    "auto --verbose",
    "next",
    "next M006",
    "do mark all complete",
    "start bugfix",
    "quick fix button",
    "new-milestone",
    "workflow resume",
    "parallel start",
    "parallel resume",
    "dispatch complete",
    "dispatch uat",
    "complete-milestone",
  ];

  for (const command of blocked) {
    assert.equal(isValidationBlockAllowedCommand(command), false, command);
  }
});

test("validation block message includes attempted command and recovery options", () => {
  const message = formatValidationBlockedMessage(blockedState(), "next");

  assert.ok(message);
  assert.match(message, /\/gsd next cannot run/);
  assert.match(message, /\/gsd status/);
  assert.match(message, /\/gsd validate-milestone/);
  assert.match(message, /\/gsd verdict pass --rationale/);
  assert.match(message, /\/gsd park M006/);
});
