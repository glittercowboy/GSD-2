/**
 * agent-end-retry.test.ts — Regression checks for the agent_end model.
 *
 * The per-unit one-shot resolve function lives at module level in auto-loop.ts
 * (_currentResolve). agent_end is handled via resolveAgentEnd().
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  _consumePendingSwitchCancellation,
  _hasPendingResolveForTest,
  _resetPendingResolve,
  _setCurrentResolve,
  _setSessionSwitchInFlight,
  isSessionSwitchInFlight,
  resolveAgentEnd,
  resolveAgentEndCancelled,
} from "../auto/resolve.ts";
import { AutoSession } from "../auto/session.ts";

test.afterEach(() => {
  _resetPendingResolve();
});

test("resolveAgentEnd resolves the current unit once and clears the resolver", () => {
  const results: unknown[] = [];
  _setCurrentResolve((result) => results.push(result));

  resolveAgentEnd({ messages: ["done"] } as any);
  resolveAgentEnd({ messages: ["late"] } as any);

  assert.equal(_hasPendingResolveForTest(), false);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], { status: "completed", event: { messages: ["done"] } });
});

test("resolveAgentEnd ignores events while a session switch is in flight", () => {
  const results: unknown[] = [];
  _setCurrentResolve((result) => results.push(result));
  _setSessionSwitchInFlight(true);

  resolveAgentEnd({ messages: ["ignored"] } as any);

  assert.equal(isSessionSwitchInFlight(), true);
  assert.equal(_hasPendingResolveForTest(), true);
  assert.deepEqual(results, []);
});

test("resolveAgentEndCancelled unblocks the current unit with cancellation context", () => {
  const results: unknown[] = [];
  _setCurrentResolve((result) => results.push(result));

  const cancelled = resolveAgentEndCancelled({ category: "idle-timeout", detail: "test" } as any);

  assert.equal(cancelled, true);
  assert.equal(_hasPendingResolveForTest(), false);
  assert.deepEqual(results, [
    { status: "cancelled", errorContext: { category: "idle-timeout", detail: "test" } },
  ]);
});

test("resolveAgentEndCancelled records cancellation that occurs during session switch", () => {
  _setSessionSwitchInFlight(true);

  const cancelled = resolveAgentEndCancelled({ category: "session-switch", detail: "test" } as any);

  assert.equal(cancelled, false);
  assert.deepEqual(_consumePendingSwitchCancellation(), {
    errorContext: { category: "session-switch", detail: "test" },
  });
});

test("AutoSession does not own agent_end promise state", () => {
  const s = new AutoSession() as any;

  assert.equal("pendingResolve" in s, false);
  assert.equal("pendingAgentEndQueue" in s, false);
  assert.equal("pendingAgentEndRetry" in s, false);
});
