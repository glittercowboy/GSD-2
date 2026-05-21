/**
 * Regression test for #2985 Bugs 3 & 4:
 *   Bug 3 — module-level pendingAutoStart singleton clobbers concurrent sessions.
 *   Bug 4 — getDiscussionMilestoneId() returns wrong project's milestone under concurrency.
 *
 * pendingAutoStart must be keyed by basePath so concurrent discuss sessions
 * in different projects are independent.  getDiscussionMilestoneId() must accept
 * a basePath parameter to perform a keyed lookup.
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getDiscussionMilestoneId,
  setPendingAutoStart,
  clearPendingAutoStart,
  checkAutoStartAfterDiscuss,
} from "../guided-flow.ts";

function pendingInput(basePath: string, milestoneId: string) {
  return {
    basePath,
    milestoneId,
    ctx: { ui: { notify: () => undefined } } as any,
    pi: { setActiveTools: () => undefined, getActiveTools: () => [] } as any,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("#2985 Bug 3 — concurrent discuss sessions must be independent", () => {
  beforeEach(() => {
    clearPendingAutoStart();
  });

  test("second session does not clobber first session's pending auto-start", () => {
    // Simulate two concurrent discuss sessions for different projects
    const projectA = "/projects/alpha";
    const projectB = "/projects/beta";

    setPendingAutoStart(projectA, {
      ...pendingInput(projectA, "M001-aaa111"),
    });

    setPendingAutoStart(projectB, {
      ...pendingInput(projectB, "M002-bbb222"),
    });

    // Both sessions should be retrievable
    const milestoneA = getDiscussionMilestoneId(projectA);
    const milestoneB = getDiscussionMilestoneId(projectB);

    assert.equal(milestoneA, "M001-aaa111", "projectA's milestone should be preserved");
    assert.equal(milestoneB, "M002-bbb222", "projectB's milestone should be preserved");
  });

  test("clearing one session does not affect the other", () => {
    const projectA = "/projects/alpha";
    const projectB = "/projects/beta";

    setPendingAutoStart(projectA, pendingInput(projectA, "M001-aaa111"));
    setPendingAutoStart(projectB, pendingInput(projectB, "M002-bbb222"));

    // Clear only projectA
    clearPendingAutoStart(projectA);

    assert.equal(getDiscussionMilestoneId(projectA), null, "projectA should be cleared");
    assert.equal(getDiscussionMilestoneId(projectB), "M002-bbb222", "projectB should survive");
  });
});

describe("#2985 Bug 4 — getDiscussionMilestoneId must be keyed by basePath", () => {
  beforeEach(() => {
    clearPendingAutoStart();
  });

  test("getDiscussionMilestoneId(basePath) returns correct milestone for each project", () => {
    setPendingAutoStart("/proj/a", pendingInput("/proj/a", "M001"));
    setPendingAutoStart("/proj/b", pendingInput("/proj/b", "M002"));

    assert.equal(getDiscussionMilestoneId("/proj/a"), "M001");
    assert.equal(getDiscussionMilestoneId("/proj/b"), "M002");
    assert.equal(getDiscussionMilestoneId("/proj/unknown"), null);
  });

  test("getDiscussionMilestoneId() without basePath returns null when multiple sessions exist", () => {
    setPendingAutoStart("/proj/a", pendingInput("/proj/a", "M001"));
    setPendingAutoStart("/proj/b", pendingInput("/proj/b", "M002"));

    // Without a key, the function should not blindly return the first entry
    const result = getDiscussionMilestoneId();
    // When there's ambiguity (multiple sessions), it should return null
    // to force callers to be explicit
    assert.equal(result, null, "should not return arbitrary milestone when multiple sessions exist");
  });

  test("getDiscussionMilestoneId() without basePath returns the milestone when only one session", () => {
    setPendingAutoStart("/proj/a", pendingInput("/proj/a", "M001"));

    // With only one session, backward compat — return it
    const result = getDiscussionMilestoneId();
    assert.equal(result, "M001", "should return the only active milestone for backward compat");
  });
});

test("checkAutoStartAfterDiscuss ignores missing manifest for single-milestone discuss on established project", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-auto-start-manifest-"));
  try {
    const gsdDir = join(base, ".gsd");
    const milestoneDir = join(gsdDir, "milestones", "M001");
    mkdirSync(milestoneDir, { recursive: true });
    mkdirSync(join(gsdDir, "milestones", "M002"), { recursive: true });
    writeFileSync(
      join(gsdDir, "PROJECT.md"),
      `# Project\n\n| M001 | First milestone | active |\n| M002 | Second milestone | queued |\n`,
    );
    writeFileSync(join(gsdDir, "STATE.md"), "# State\n");
    writeFileSync(join(milestoneDir, "M001-CONTEXT.md"), "# M001 Context\n");

    clearPendingAutoStart();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: { ui: { notify: () => undefined } } as any,
      pi: { setActiveTools: () => undefined, getActiveTools: () => [] } as any,
    });

    const started = checkAutoStartAfterDiscuss();
    assert.equal(started, true, "project history alone should not require a manifest");
  } finally {
    clearPendingAutoStart();
    rmSync(base, { recursive: true, force: true });
  }
});

test("checkAutoStartAfterDiscuss(basePath) selects the matching pending entry when multiple sessions exist", () => {
  const projectA = mkdtempSync(join(tmpdir(), "gsd-auto-start-project-a-"));
  const projectB = mkdtempSync(join(tmpdir(), "gsd-auto-start-project-b-"));

  function writeReadyArtifacts(base: string, milestoneId: string): void {
    const gsdDir = join(base, ".gsd");
    const milestoneDir = join(gsdDir, "milestones", milestoneId);
    mkdirSync(milestoneDir, { recursive: true });
    writeFileSync(join(gsdDir, "PROJECT.md"), `# Project\n\n| ${milestoneId} | Milestone | active |\n`);
    writeFileSync(join(gsdDir, "STATE.md"), "# State\n");
    writeFileSync(join(milestoneDir, `${milestoneId}-CONTEXT.md`), "# Context\n");
  }

  try {
    clearPendingAutoStart();
    writeReadyArtifacts(projectA, "M001");
    writeReadyArtifacts(projectB, "M002");
    setPendingAutoStart(projectA, {
      basePath: projectA,
      milestoneId: "M001",
      ctx: { ui: { notify: () => undefined } } as any,
      pi: { setActiveTools: () => undefined, getActiveTools: () => [] } as any,
    });
    setPendingAutoStart(projectB, {
      basePath: projectB,
      milestoneId: "M002",
      ctx: { ui: { notify: () => undefined } } as any,
      pi: { setActiveTools: () => undefined, getActiveTools: () => [] } as any,
    });

    assert.equal(checkAutoStartAfterDiscuss(), false, "ambiguous pending sessions should not auto-start");
    assert.equal(checkAutoStartAfterDiscuss(projectB), true, "explicit basePath should select projectB");
    assert.equal(getDiscussionMilestoneId(projectA), "M001", "projectA should remain pending");
    assert.equal(getDiscussionMilestoneId(projectB), null, "projectB should be cleared after start");
  } finally {
    clearPendingAutoStart();
    rmSync(projectA, { recursive: true, force: true });
    rmSync(projectB, { recursive: true, force: true });
  }
});

test("checkAutoStartAfterDiscuss can emit ready without scheduling auto-start", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-auto-start-headless-owned-"));
  let waitForIdleCalls = 0;
  const notifications: string[] = [];
  try {
    const gsdDir = join(base, ".gsd");
    const milestoneDir = join(gsdDir, "milestones", "M001");
    mkdirSync(milestoneDir, { recursive: true });
    writeFileSync(join(gsdDir, "PROJECT.md"), "# Project\n\n| M001 | First milestone | active |\n");
    writeFileSync(join(gsdDir, "STATE.md"), "# State\n");
    writeFileSync(join(milestoneDir, "M001-CONTEXT.md"), "# M001 Context\n");

    clearPendingAutoStart();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      startAuto: false,
      ctx: {
        waitForIdle: async () => {
          waitForIdleCalls++;
        },
        ui: {
          notify: (message: string) => {
            notifications.push(message);
          },
        },
      } as any,
      pi: { setActiveTools: () => undefined, getActiveTools: () => [] } as any,
    });

    assert.equal(checkAutoStartAfterDiscuss(base), true);
    assert.deepEqual(notifications, ["Milestone M001 ready."]);
    assert.equal(waitForIdleCalls, 0, "headless-owned auto start must not schedule guided-flow auto");
    assert.equal(getDiscussionMilestoneId(base), null, "ready handoff should still be cleared");
  } finally {
    clearPendingAutoStart();
    rmSync(base, { recursive: true, force: true });
  }
});
