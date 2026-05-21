/**
 * phases-merge-error-stops-auto.test.ts — Regression test for #2766.
 *
 * When mergeAndExit throws a non-MergeConflictError, the auto loop must
 * halt instead of continuing with unmerged work. A merge failure is a
 * recoverable human checkpoint, so the loop pauses (resumable via
 * `/gsd auto`) rather than hard-stopping. This test verifies the catch
 * block in auto/phases.ts calls pauseAuto and returns { action: "break" }
 * for non-conflict errors.
 */

import { createTestContext } from "./test-helpers.ts";
import { runPreDispatch } from "../auto/phases.ts";

const { assertTrue, report } = createTestContext();

console.log("\n=== #2766: Non-MergeConflictError stops auto mode ===");

const notifications: Array<{ message: string; level?: string }> = [];
const calls: string[] = [];
const basePath = "/tmp/gsd-test";
const ic = {
  ctx: {
    ui: {
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  },
  pi: {},
  s: {
    basePath,
    originalBasePath: basePath,
    canonicalProjectRoot: basePath,
    resourceVersionOnStart: "test",
    currentMilestoneId: "M001",
    currentUnit: null,
    milestoneMergedInPhases: false,
  },
  prefs: undefined,
  iteration: 1,
  flowId: "test-flow",
  nextSeq: () => 1,
  deps: {
    checkResourcesStale() {
      return null;
    },
    invalidateAllCaches() {
      calls.push("invalidate");
    },
    async preDispatchHealthGate() {
      calls.push("health");
      return { proceed: true, fixesApplied: [] };
    },
    async deriveState(projectRoot: string) {
      calls.push(`derive:${projectRoot}`);
      return {
        phase: "complete",
        activeMilestone: { id: "M001", title: "Milestone one" },
        activeSlice: null,
        activeTask: null,
        registry: [{ id: "M001", status: "complete" }],
        nextAction: "complete",
      };
    },
    syncCmuxSidebar() {
      calls.push("sync-sidebar");
    },
    setActiveMilestoneId(_basePath: string, mid: string) {
      calls.push(`set-active:${mid}`);
    },
    reconcileMergeState() {
      calls.push("reconcile");
      return "clean";
    },
    preflightCleanRoot() {
      calls.push("preflight");
      return { ok: true, stashPushed: true, stashMarker: "marker" };
    },
    postflightPopStash() {
      calls.push("postflight");
      return { ok: true, needsManualRecovery: false };
    },
    lifecycle: {
      exitMilestone() {
        calls.push("merge");
        return {
          ok: false,
          reason: "teardown-failed",
          cause: new Error("remote rejected push"),
        };
      },
    },
    async stopAuto(_ctx: unknown, _pi: unknown, reason?: string) {
      calls.push(`stop:${reason}`);
    },
    async pauseAuto(
      _ctx: unknown,
      _pi: unknown,
      errorContext?: { message: string },
    ) {
      calls.push(`pause:${errorContext?.message}`);
    },
  },
} as any;

const result = await runPreDispatch(ic, {
  recentUnits: [],
  stuckRecoveryAttempts: 0,
  consecutiveFinalizeTimeouts: 0,
});

assertTrue(result.action === "break", "non-conflict merge error returns break");
if (result.action === "break") {
  assertTrue(result.reason === "merge-failed", "non-conflict merge error uses merge-failed reason");
}
assertTrue(
  calls.join(" > ") === "invalidate > health > derive:/tmp/gsd-test > sync-sidebar > set-active:M001 > reconcile > preflight > merge > postflight > pause:Merge error on milestone M001: remote rejected push. Resolve and run /gsd auto to resume.",
  `pre-dispatch pauses immediately after non-conflict merge failure (${calls.join(" > ")})`,
);
assertTrue(
  notifications.some((n) => n.level === "error" && n.message.includes("Merge error on milestone M001: remote rejected push")),
  "user is notified with an error that the merge failed",
);

report();
