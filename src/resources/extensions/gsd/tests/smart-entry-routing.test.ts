// GSD-2 — Smart entry routing behavior tests.
// Verifies guided wizard choices resolve to the correct execution path.

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveActiveTaskChoiceRoute,
  resolveGuidedExecuteLaunchMode,
  type ActiveTaskChoice,
  type ActiveTaskRoute,
  type SmartEntryIsolationMode,
} from "../smart-entry-routing.ts";

test("guided execute route enters auto step bootstrap only for worktree isolation", () => {
  const cases: Array<{
    isolationMode: SmartEntryIsolationMode;
    expectedRoute: ActiveTaskRoute;
  }> = [
    {
      isolationMode: "worktree",
      expectedRoute: {
        kind: "auto-bootstrap",
        verboseMode: false,
        options: {
          step: true,
          milestoneLock: "M001",
        },
      },
    },
    {
      isolationMode: "none",
      expectedRoute: {
        kind: "guided-dispatch",
        unitType: "execute-task",
      },
    },
    {
      isolationMode: "branch",
      expectedRoute: {
        kind: "guided-dispatch",
        unitType: "execute-task",
      },
    },
  ];

  for (const testCase of cases) {
    assert.deepEqual(
      resolveActiveTaskChoiceRoute({
        choice: "execute",
        isolationMode: testCase.isolationMode,
        milestoneId: "M001",
      }),
      testCase.expectedRoute,
    );
  }
});

test("active task smart entry choices resolve to explicit routes", () => {
  const cases: Array<{
    choice: ActiveTaskChoice;
    expectedRoute: ActiveTaskRoute;
  }> = [
    {
      choice: "auto",
      expectedRoute: {
        kind: "auto-bootstrap",
        verboseMode: false,
      },
    },
    {
      choice: "status",
      expectedRoute: {
        kind: "status",
      },
    },
    {
      choice: "milestone_actions",
      expectedRoute: {
        kind: "milestone-actions",
      },
    },
  ];

  for (const testCase of cases) {
    assert.deepEqual(
      resolveActiveTaskChoiceRoute({
        choice: testCase.choice,
        isolationMode: "worktree",
        milestoneId: "M001",
      }),
      testCase.expectedRoute,
    );
  }
});

test("active task route rejects invalid choices from untyped callers", () => {
  assert.throws(
    () =>
      resolveActiveTaskChoiceRoute({
        choice: "not_yet" as ActiveTaskChoice,
        isolationMode: "worktree",
        milestoneId: "M001",
      }),
    /Invalid ActiveTaskChoice: not_yet/,
  );
});

test("guided execute launch mode remains a small compatibility helper", () => {
  assert.equal(resolveGuidedExecuteLaunchMode("worktree"), "auto-step");
  assert.equal(resolveGuidedExecuteLaunchMode("none"), "guided-dispatch");
  assert.equal(resolveGuidedExecuteLaunchMode("branch"), "guided-dispatch");
});
