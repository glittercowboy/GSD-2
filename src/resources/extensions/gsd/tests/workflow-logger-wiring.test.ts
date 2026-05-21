// GSD-2 — workflow-logger behavior regression tests.

import test from "node:test";
import assert from "node:assert/strict";

import {
  drainAndSummarize,
  formatForNotification,
  hasAnyIssues,
  logError,
  logWarning,
  peekLogs,
  _resetLogs,
  setStderrLoggingEnabled,
} from "../workflow-logger.ts";
import { detectStuck } from "../auto/detect-stuck.ts";

test("drainAndSummarize summarizes and clears the workflow log buffer", () => {
  const previous = setStderrLoggingEnabled(false);
  try {
    _resetLogs();
    logWarning("projection", "STATE.md render failed", { file: "STATE.md" });
    logError("db", "WAL checkpoint failed");

    assert.equal(hasAnyIssues(), true);
    const drained = drainAndSummarize();

    assert.equal(drained.logs.length, 2);
    assert.match(drained.summary ?? "", /STATE\.md render failed/);
    assert.match(drained.summary ?? "", /WAL checkpoint failed/);
    assert.equal(peekLogs().length, 0);
  } finally {
    _resetLogs();
    setStderrLoggingEnabled(previous);
  }
});

test("formatForNotification includes component and useful context", () => {
  const text = formatForNotification([
    {
      ts: "2026-01-01T00:00:00.000Z",
      severity: "warn",
      component: "projection",
      message: "render failed",
      context: { file: "STATE.md", command: "derive" },
    },
  ]);

  assert.match(text, /\[projection\] render failed/);
  assert.match(text, /file: STATE\.md/);
  assert.match(text, /command: derive/);
});

test("detectStuck reason includes workflow-logger summary when logs present", () => {
  const previous = setStderrLoggingEnabled(false);
  try {
    _resetLogs();
    logWarning("projection", "STATE.md render failed");
    logError("db", "WAL checkpoint failed");

    const result = detectStuck([
      { key: "execute-task/slice-A/task-1", error: "ENOENT: no such file" },
      { key: "execute-task/slice-A/task-1", error: "ENOENT: no such file" },
    ]);

    assert.notEqual(result, null);
    assert.equal(result!.stuck, true);
    assert.match(result!.reason, /Same error repeated:/);
    assert.match(result!.reason, /STATE\.md render failed/);
    assert.match(result!.reason, /WAL checkpoint failed/);
    assert.equal(peekLogs().length, 2, "detect-stuck must not drain the buffer");
  } finally {
    _resetLogs();
    setStderrLoggingEnabled(previous);
  }
});

test("detectStuck reason unchanged when logger buffer is empty", () => {
  const previous = setStderrLoggingEnabled(false);
  try {
    _resetLogs();
    const result = detectStuck([
      { key: "A", error: "boom" },
      { key: "A", error: "boom" },
    ]);
    assert.notEqual(result, null);
    assert.doesNotMatch(result!.reason, / — \d+ (error|warning)/);
  } finally {
    _resetLogs();
    setStderrLoggingEnabled(previous);
  }
});
