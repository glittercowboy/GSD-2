// Project/App: GSD-2
// File Purpose: Tests for host-owned auto-mode verification verdict policy.

import test from "node:test";
import assert from "node:assert/strict";

import { decideVerificationVerdict } from "../verification-verdict.ts";
import type { VerificationResult } from "../types.ts";

function makeResult(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    passed: true,
    checks: [],
    discoverySource: "none",
    timestamp: 1,
    ...overrides,
  };
}

test("execute-task fails closed when no host-owned checks are discovered", () => {
  const verdict = decideVerificationVerdict("execute-task", makeResult());

  assert.equal(verdict.passed, false);
  assert.equal(verdict.reason, "no-host-checks");
  assert.equal(verdict.retryable, false);
  assert.match(verdict.failureContext, /No runnable host-owned verification command/);
});

test("non execute-task units preserve no-check pass semantics", () => {
  const verdict = decideVerificationVerdict("plan-slice", makeResult());

  assert.equal(verdict.passed, true);
  assert.equal(verdict.reason, "passed");
});

test("execute-task command failure remains retryable verification failure", () => {
  const verdict = decideVerificationVerdict(
    "execute-task",
    makeResult({
      passed: false,
      discoverySource: "package-json",
      checks: [
        {
          command: "npm test",
          exitCode: 1,
          stdout: "",
          stderr: "failed",
          durationMs: 10,
        },
      ],
    }),
  );

  assert.equal(verdict.passed, false);
  assert.equal(verdict.reason, "checks-failed");
  assert.equal(verdict.retryable, true);
});

test("execute-task passes when a discovered host check succeeds", () => {
  const verdict = decideVerificationVerdict(
    "execute-task",
    makeResult({
      discoverySource: "preference",
      checks: [
        {
          command: "npm test",
          exitCode: 0,
          stdout: "ok",
          stderr: "",
          durationMs: 10,
        },
      ],
    }),
  );

  assert.equal(verdict.passed, true);
  assert.equal(verdict.reason, "passed");
});
