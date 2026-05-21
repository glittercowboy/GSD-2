/**
 * Regression tests for memory pressure monitoring (#3331) and
 * stuck detection persistence (#3704) in auto/loop.ts.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { decideMemoryPressure } from "../auto/workflow-kernel.ts";
import { completeWorkflowIteration } from "../auto/workflow-iteration-completion.ts";
import { measureMemoryPressure } from "../auto/workflow-memory-pressure.ts";

describe("memory pressure monitoring (#3331)", () => {
  test("measureMemoryPressure reports pressure above threshold", () => {
    const snapshot = measureMemoryPressure({
      threshold: 0.5,
      deps: {
        memoryUsage: () => ({ heapUsed: 768 * 1024 * 1024 }),
        heapLimitBytes: () => 1024 * 1024 * 1024,
      },
    });

    assert.equal(snapshot.pressured, true);
    assert.equal(snapshot.heapMB, 768);
    assert.equal(snapshot.limitMB, 1024);
  });

  test("measureMemoryPressure defaults to a sub-100-percent threshold", () => {
    const snapshot = measureMemoryPressure({
      deps: {
        memoryUsage: () => ({ heapUsed: 3584 * 1024 * 1024 }),
        heapLimitBytes: () => 4096 * 1024 * 1024,
      },
    });

    assert.equal(snapshot.pressured, true);
  });

  test("memory pressure triggers graceful stopAuto", () => {
    const decision = decideMemoryPressure({
      pressured: true,
      heapMB: 3900,
      limitMB: 4096,
      pct: 0.95,
      iteration: 10,
    });

    assert.equal(decision.action, "stop");
    assert.match(decision.stopMessage, /Stopping gracefully to prevent OOM/);
  });
});

describe("stuck detection persistence (#3704)", () => {
  // Phase C: stuck-state.json file IO deleted; persistence moved to
  // unit_dispatches (recentUnits) + runtime_kv (stuckRecoveryAttempts).
  // The stuck-state-via-db.test.ts suite covers the round-trip.

  test("completeWorkflowIteration saves stuck state while clearing recovery counters (#4382)", () => {
    const calls: string[] = [];
    const state = {
      consecutiveErrors: 2,
      consecutiveCooldowns: 1,
      recentErrorMessages: ["boom"],
    };

    completeWorkflowIteration(state, {
      emitIterationEnd: () => calls.push("emit"),
      saveStuckState: () => calls.push("save"),
      logIterationComplete: () => calls.push("log"),
    });

    assert.deepEqual(calls, ["emit", "save", "log"]);
    assert.deepEqual(state, {
      consecutiveErrors: 0,
      consecutiveCooldowns: 0,
      recentErrorMessages: [],
    });
  });
});
