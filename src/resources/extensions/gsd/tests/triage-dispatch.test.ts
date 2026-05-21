// GSD-2 — Triage and quick-task dispatch behavior tests.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  appendCapture,
  countPendingCaptures,
  hasPendingCaptures,
  loadPendingCaptures,
  markCaptureExecuted,
  markCaptureResolved,
} from "../captures.ts";
import { checkPostUnitHooks } from "../post-unit-hooks.ts";
import {
  _shouldDispatchQuickTaskForTest,
  _shouldDispatchTriageForTest,
} from "../auto-post-unit.ts";
import {
  buildQuickTaskPrompt,
  loadDeferredCaptures,
  loadReplanCaptures,
} from "../triage-resolution.ts";

function makeProject(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-triage-dispatch-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    [
      "# M001",
      "",
      "## Slices",
      "- [ ] **S01: Slice** `risk:low` `depends:[]`",
    ].join("\n"),
  );
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
    "# S01 Plan\n\n## Tasks\n- [ ] **T01: Task** `est:10m`\n",
  );
  return base;
}

test("post-unit hooks exclude triage and quick-task units", () => {
  assert.equal(checkPostUnitHooks("triage-captures", "M001/S01/triage", "/tmp/project"), null);
  assert.equal(checkPostUnitHooks("quick-task", "M001/CAP-1", "/tmp/project"), null);
});

test("triage dispatch guard excludes step mode, hook units, triage units, and quick tasks", () => {
  const normal = { stepMode: false, currentUnit: { type: "execute-task", id: "M001/S01/T01", startedAt: 1 } };
  assert.equal(_shouldDispatchTriageForTest(normal as any), true);
  assert.equal(_shouldDispatchTriageForTest({ ...normal, stepMode: true } as any), false);
  assert.equal(
    _shouldDispatchTriageForTest({ stepMode: false, currentUnit: { type: "hook/review", id: "M001/S01/T01", startedAt: 1 } } as any),
    false,
  );
  assert.equal(
    _shouldDispatchTriageForTest({ stepMode: false, currentUnit: { type: "triage-captures", id: "M001/S01/triage", startedAt: 1 } } as any),
    false,
  );
  assert.equal(
    _shouldDispatchTriageForTest({ stepMode: false, currentUnit: { type: "quick-task", id: "M001/CAP-1", startedAt: 1 } } as any),
    false,
  );
});

test("quick-task dispatch guard requires queued captures and avoids quick-task recursion", () => {
  const capture = {
    id: "CAP-test",
    text: "Fix typo",
    timestamp: new Date().toISOString(),
    status: "resolved" as const,
    classification: "quick-task" as const,
  };
  assert.equal(
    _shouldDispatchQuickTaskForTest({
      stepMode: false,
      currentUnit: { type: "execute-task", id: "M001/S01/T01", startedAt: 1 },
      pendingQuickTasks: [capture],
    } as any),
    true,
  );
  assert.equal(
    _shouldDispatchQuickTaskForTest({
      stepMode: false,
      currentUnit: { type: "quick-task", id: "M001/CAP-test", startedAt: 1 },
      pendingQuickTasks: [capture],
    } as any),
    false,
  );
  assert.equal(
    _shouldDispatchQuickTaskForTest({
      stepMode: false,
      currentUnit: { type: "execute-task", id: "M001/S01/T01", startedAt: 1 },
      pendingQuickTasks: [],
    } as any),
    false,
  );
});

test("capture lifecycle exposes pending, replan, deferred, and executed states", () => {
  const base = makeProject();
  try {
    const pendingId = appendCapture(base, "Need a quick follow-up.");
    const replanId = appendCapture(base, "Plan needs a new task.");
    const deferId = appendCapture(base, "Create a future milestone.");

    assert.equal(hasPendingCaptures(base), true);
    assert.equal(countPendingCaptures(base), 3);
    assert.deepEqual(loadPendingCaptures(base).map((entry) => entry.id).sort(), [deferId, pendingId, replanId].sort());

    markCaptureResolved(base, replanId, "replan", "replan slice", "Need plan update", "M001");
    markCaptureResolved(base, deferId, "defer", "defer milestone", "Out of current scope", "M001");
    markCaptureExecuted(base, replanId);

    assert.equal(loadReplanCaptures(base).some((entry) => entry.id === replanId), true);
    assert.equal(loadDeferredCaptures(base).some((entry) => entry.id === deferId), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("quick-task prompt carries capture identity and completion instruction", () => {
  const prompt = buildQuickTaskPrompt({
    id: "CAP-quick",
    text: "Fix the CLI typo",
    timestamp: new Date().toISOString(),
    status: "resolved",
    classification: "quick-task",
  });

  assert.match(prompt, /CAP-quick/);
  assert.match(prompt, /Fix the CLI typo/);
  assert.match(prompt, /Quick task complete/);
});
