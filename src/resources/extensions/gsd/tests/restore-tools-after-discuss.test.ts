/**
 * Regression test for #3628 — restore tool set after discuss flow scoping.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { _dispatchWorkflowForTest } from "../guided-flow.ts";

test("discuss workflow scopes tools for the queued turn and restores the full tool set", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-discuss-tools-"));
  const workflowPath = join(dir, "GSD-WORKFLOW.md");
  const originalWorkflowPath = process.env.GSD_WORKFLOW_PATH;
  const originalTools = [
    "gsd_task_complete",
    "gsd_summary_save",
    "shell_exec",
    "gsd_plan_milestone",
  ];
  let activeTools = [...originalTools];
  let sentTools: string[] | null = null;
  let triggerTurn = false;

  const pi = {
    getActiveTools: () => [...activeTools],
    setActiveTools: (tools: string[]) => {
      activeTools = [...tools];
    },
    sendMessage: (_message: unknown, options?: { triggerTurn?: boolean }) => {
      sentTools = [...activeTools];
      triggerTurn = options?.triggerTurn === true;
    },
  };

  try {
    writeFileSync(workflowPath, "# Workflow\n", "utf-8");
    process.env.GSD_WORKFLOW_PATH = workflowPath;

    await _dispatchWorkflowForTest(
      pi as any,
      "Interview the user.",
      "gsd-discuss",
      undefined,
      "discuss-milestone",
    );

    // The queued discuss-milestone turn keeps only the GSD tools on the
    // discuss allowlist: gsd_summary_save and gsd_plan_milestone (the latter
    // is needed for the discuss.md output phase — see DISCUSS_TOOLS_ALLOWLIST).
    // gsd_task_complete and the broad shell_exec tool are scoped out.
    assert.deepEqual(sentTools, ["gsd_summary_save", "gsd_plan_milestone"]);
    assert.deepEqual(activeTools, originalTools);
    assert.equal(triggerTurn, true);
  } finally {
    if (originalWorkflowPath === undefined) {
      delete process.env.GSD_WORKFLOW_PATH;
    } else {
      process.env.GSD_WORKFLOW_PATH = originalWorkflowPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
