// GSD-2 + src/resources/extensions/gsd/tests/orphan-merge-bootstrap.test.ts
// Regression: bootstrap must actively merge orphan completed-but-unmerged
// milestones, not just seed `s.currentMilestoneId` (the seed approach was
// silently overwritten at auto-start.ts:948 — caught in audit of PR #5549).
//
// After ADR-016 / slice 7 step E, _mergeOrphanCompletedMilestone takes a
// WorktreeLifecycle and inspects the typed ExitResult instead of catching
// a throw — the fakeLifecycle below returns {ok:false, cause} to model the
// previous throw shape.

import test from "node:test";
import assert from "node:assert/strict";

import { _mergeOrphanCompletedMilestone } from "../auto-start.js";
import type { WorktreeLifecycle } from "../worktree-lifecycle.js";

interface FakeLifecycleState {
  mergeCalls: Array<{ milestoneId: string }>;
  causeOnFail?: unknown;
}

function fakeLifecycle(state: FakeLifecycleState): WorktreeLifecycle {
  return {
    exitMilestone: (milestoneId: string) => {
      state.mergeCalls.push({ milestoneId });
      if (state.causeOnFail !== undefined) {
        return { ok: false, reason: "teardown-failed", cause: state.causeOnFail };
      }
      return { ok: true, merged: true, codeFilesChanged: false };
    },
  } as unknown as WorktreeLifecycle;
}

interface FakeUiState {
  notifications: Array<{ message: string; level: string }>;
}

function fakeUi(state: FakeUiState): {
  notify: (msg: string, level?: "info" | "warning" | "error" | "success") => void;
} {
  return {
    notify: (message: string, level?: "info" | "warning" | "error" | "success") => {
      state.notifications.push({ message, level: level ?? "info" });
    },
  };
}

test("happy path: orphan merge runs, returns merged:true, emits info notify", () => {
  const lcState: FakeLifecycleState = { mergeCalls: [] };
  const uiState: FakeUiState = { notifications: [] };
  const result = _mergeOrphanCompletedMilestone(
    fakeLifecycle(lcState),
    "M002",
    fakeUi(uiState),
  );

  assert.deepEqual(result, { merged: true });
  assert.deepEqual(lcState.mergeCalls, [{ milestoneId: "M002" }]);
  assert.equal(uiState.notifications.length, 1);
  assert.deepEqual(uiState.notifications[0], {
    message: "Detected unmerged completed milestone M002. Merging now.",
    level: "info",
  });
});

test("regression: failure from exitMilestone (e.g. wrong-branch from PR #5549 commit 5) does not bubble out", () => {
  // Commit 5 (68ef58a3c) made `_mergeBranchMode` throw on wrong branch
  // instead of silently returning false. Lifecycle now wraps the throw in
  // {ok:false, cause}; _mergeOrphanCompletedMilestone must surface that as
  // a notify, never re-throwing into the slash-command caller.
  const boom = new Error("dirty working tree blocks checkout");
  const lcState: FakeLifecycleState = { mergeCalls: [], causeOnFail: boom };
  const uiState: FakeUiState = { notifications: [] };

  const result = _mergeOrphanCompletedMilestone(
    fakeLifecycle(lcState),
    "M002",
    fakeUi(uiState),
  );

  assert.equal(result.merged, false);
  assert.equal(result.error, boom);

  // First notify announces the merge attempt; second notify reports the failure.
  assert.equal(uiState.notifications.length, 2);
  assert.equal(uiState.notifications[0].level, "info");
  assert.equal(uiState.notifications[1].level, "warning");
  assert.match(
    uiState.notifications[1].message,
    /Could not merge orphan milestone M002/,
  );
  assert.match(uiState.notifications[1].message, /dirty working tree blocks checkout/);
  assert.match(uiState.notifications[1].message, /Resolve manually/);
});

test("non-Error failure causes are still captured and notified", () => {
  // Defensive: non-Error causes (strings, numbers) must not crash the formatter.
  const lcState: FakeLifecycleState = {
    mergeCalls: [],
    // mimic a non-Error cause
    causeOnFail: "git lock held",
  };
  const uiState: FakeUiState = { notifications: [] };

  const result = _mergeOrphanCompletedMilestone(
    fakeLifecycle(lcState),
    "M002",
    fakeUi(uiState),
  );

  assert.equal(result.merged, false);
  assert.equal(uiState.notifications[1].level, "warning");
  assert.match(uiState.notifications[1].message, /git lock held/);
});

test("the exitMilestone call receives a notify-bound NotifyCtx the lifecycle can invoke", () => {
  // The lifecycle's NotifyCtx must be wired to ui.notify so user-facing
  // messages from inside exitMilestone (e.g. "Milestone Mxxx merged") still
  // reach the UI. Verify by having the fake invoke ctx.notify.
  const uiState: FakeUiState = { notifications: [] };
  const ui = fakeUi(uiState);

  const lifecycle = {
    exitMilestone: (
      _milestoneId: string,
      _opts: { merge: boolean },
      ctx: { notify: (msg: string, level?: "info" | "warning" | "error" | "success") => void },
    ) => {
      ctx.notify("inner success message", "success");
      return { ok: true, merged: true, codeFilesChanged: false };
    },
  } as unknown as WorktreeLifecycle;

  const result = _mergeOrphanCompletedMilestone(lifecycle, "M002", ui);

  assert.equal(result.merged, true);
  // 1: outer "Detected unmerged completed milestone..."
  // 2: inner "inner success message" emitted via the bound ctx.notify
  assert.equal(uiState.notifications.length, 2);
  assert.deepEqual(uiState.notifications[1], {
    message: "inner success message",
    level: "success",
  });
});
