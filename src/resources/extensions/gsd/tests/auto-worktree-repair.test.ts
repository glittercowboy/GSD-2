// Project/App: GSD-2
// File Purpose: Regression tests for safe auto-mode milestone worktree repair.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assessAutoWorktreeRepairTarget,
  repairAutoWorktreeSafetyFailure,
  resolvePausedAutoWorktreePath,
} from "../auto-worktree-repair.ts";
import type { WorktreeSafetyResult } from "../worktree-safety.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-auto-wt-repair-"));
  mkdirSync(join(base, ".gsd", "worktrees"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

test("repair target accepts a missing expected milestone worktree", () => {
  const base = makeBase();
  try {
    const result = assessAutoWorktreeRepairTarget({
      projectRoot: base,
      milestoneId: "M001",
      activeRoot: base,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.expectedPath, join(base, ".gsd", "worktrees", "M001"));
    }
  } finally {
    cleanup(base);
  }
});

test("repair target accepts a stale metadata-only worktree directory", () => {
  const base = makeBase();
  const expected = join(base, ".gsd", "worktrees", "M001");
  try {
    mkdirSync(join(expected, ".gsd"), { recursive: true });

    const result = assessAutoWorktreeRepairTarget({
      projectRoot: base,
      milestoneId: "M001",
      activeRoot: base,
    });

    assert.equal(result.ok, true);
  } finally {
    cleanup(base);
  }
});

test("repair target rejects stale worktree directories with source content", () => {
  const base = makeBase();
  const expected = join(base, ".gsd", "worktrees", "M001");
  try {
    mkdirSync(expected, { recursive: true });
    writeFileSync(join(expected, "index.html"), "<main></main>\n", "utf-8");

    const result = assessAutoWorktreeRepairTarget({
      projectRoot: base,
      milestoneId: "M001",
      activeRoot: base,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /non-GSD content/);
    }
  } finally {
    cleanup(base);
  }
});

test("repair target rejects invalid-root drift from an unrelated worktree", () => {
  const base = makeBase();
  const otherWorktree = join(base, ".gsd", "worktrees", "M000");
  try {
    mkdirSync(otherWorktree, { recursive: true });

    const result = assessAutoWorktreeRepairTarget({
      projectRoot: base,
      milestoneId: "M001",
      activeRoot: otherWorktree,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /neither project root nor expected worktree/);
    }
  } finally {
    cleanup(base);
  }
});

test("repair reruns validation after recreating a recoverable invalid-root", async () => {
  const base = makeBase();
  const expected = join(base, ".gsd", "worktrees", "M001");
  const failure: WorktreeSafetyResult = {
    ok: false,
    kind: "invalid-root",
    reason: "Unit root is not the expected worktree root.",
    remediation: "Prepare the canonical milestone worktree.",
    details: { expectedRoot: expected, unitRoot: base },
  };
  const success: WorktreeSafetyResult = {
    ok: true,
    kind: "safe",
    projectRoot: base,
    unitRoot: expected,
    milestoneId: "M001",
    branch: "milestone/M001",
  };
  let enterCalls = 0;
  try {
    const result = await repairAutoWorktreeSafetyFailure({
      safetyResult: failure,
      projectRoot: base,
      activeRoot: base,
      milestoneId: "M001",
      enterMilestone: () => {
        enterCalls += 1;
        return { ok: true };
      },
      revalidate: () => success,
    });

    assert.equal(enterCalls, 1);
    assert.equal(result.repaired, true);
    assert.equal(result.result, success);
  } finally {
    cleanup(base);
  }
});

test("repair does not enter when the stale target contains source files", async () => {
  const base = makeBase();
  const expected = join(base, ".gsd", "worktrees", "M001");
  const failure: WorktreeSafetyResult = {
    ok: false,
    kind: "invalid-root",
    reason: "Unit root is not the expected worktree root.",
    remediation: "Prepare the canonical milestone worktree.",
    details: { expectedRoot: expected, unitRoot: base },
  };
  let enterCalls = 0;
  try {
    mkdirSync(expected, { recursive: true });
    writeFileSync(join(expected, "app.js"), "console.log('work');\n", "utf-8");

    const result = await repairAutoWorktreeSafetyFailure({
      safetyResult: failure,
      projectRoot: base,
      activeRoot: base,
      milestoneId: "M001",
      enterMilestone: () => {
        enterCalls += 1;
        return { ok: true };
      },
      revalidate: () => {
        throw new Error("should not revalidate");
      },
    });

    assert.equal(enterCalls, 0);
    assert.equal(result.repaired, false);
    assert.equal(result.result, failure);
    assert.match(result.repairReason ?? "", /non-GSD content/);
  } finally {
    cleanup(base);
  }
});

test("paused metadata path resolves to the expected worktree while paused at project root", () => {
  const base = makeBase();
  try {
    const result = resolvePausedAutoWorktreePath({
      basePath: base,
      originalBasePath: base,
      currentMilestoneId: "M001",
      isolationMode: "worktree",
      baseIsAutoWorktree: false,
    });

    assert.equal(result, join(base, ".gsd", "worktrees", "M001"));
  } finally {
    cleanup(base);
  }
});
