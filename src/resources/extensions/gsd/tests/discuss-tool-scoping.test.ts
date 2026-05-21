/**
 * discuss-tool-scoping.test.ts — Tests for #2949.
 *
 * xAI/Grok returns "Grammar is too complex" (400) when the combined tool
 * schemas exceed the provider's grammar limit. The GSD discuss flow only
 * needs a small subset of tools (summary_save, decision_save, etc.), but
 * was sending ALL ~30+ tools to the provider.
 *
 * These tests verify:
 *   1. DISCUSS_TOOLS_ALLOWLIST is exported and contains only the tools
 *      needed during discuss flows (no heavy planning/execution/completion tools).
 *   2. Heavy execution tools are NOT in the allowlist.
 *   3. The allowlist includes the tools actually referenced by discuss prompts.
 *   4. dispatchWorkflow scopes tools when unitType is a discuss variant.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DISCUSS_TOOLS_ALLOWLIST } from "../constants.ts";
import { _dispatchWorkflowForTest } from "../guided-flow.ts";

// ─── Heavy tools that should NOT be in discuss scope ─────────────────────────

/** Tools that are only needed during planning, execution, or completion phases */
const HEAVY_TOOLS = [
  "gsd_plan_slice",
  "gsd_slice_plan",
  "gsd_plan_task",
  "gsd_task_plan",
  "gsd_task_complete",
  "gsd_complete_task",
  "gsd_slice_complete",
  "gsd_complete_slice",
  "gsd_complete_milestone",
  "gsd_milestone_complete",
  "gsd_validate_milestone",
  "gsd_milestone_validate",
  "gsd_replan_slice",
  "gsd_slice_replan",
  "gsd_reassess_roadmap",
  "gsd_roadmap_reassess",
  "gsd_save_gate_result",
];

// ─── Tools that discuss prompts reference ────────────────────────────────────

/** Tools explicitly called by discuss prompt templates */
const DISCUSS_REQUIRED_TOOLS = [
  "gsd_summary_save",          // guided-discuss-slice.md, guided-discuss-milestone.md, discuss.md
  "gsd_decision_save",         // discuss.md output phase
  "gsd_plan_milestone",        // discuss.md output phase (single + multi milestone)
  "gsd_milestone_generate_id", // discuss.md multi-milestone Phase 1
  "gsd_requirement_save",      // discuss-headless.md capability contract creation
  "gsd_requirement_update",    // used during discuss for requirement updates
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("discuss tool scoping (#2949)", () => {
  test("DISCUSS_TOOLS_ALLOWLIST is exported and non-empty", () => {
    assert.ok(Array.isArray(DISCUSS_TOOLS_ALLOWLIST), "should be an array");
    assert.ok(DISCUSS_TOOLS_ALLOWLIST.length > 0, "should not be empty");
  });

  test("DISCUSS_TOOLS_ALLOWLIST excludes heavy execution/completion tools", () => {
    for (const heavy of HEAVY_TOOLS) {
      assert.ok(
        !DISCUSS_TOOLS_ALLOWLIST.includes(heavy),
        `allowlist should NOT include heavy tool "${heavy}"`,
      );
    }
  });

  test("DISCUSS_TOOLS_ALLOWLIST includes tools referenced by discuss prompts", () => {
    for (const required of DISCUSS_REQUIRED_TOOLS) {
      assert.ok(
        DISCUSS_TOOLS_ALLOWLIST.includes(required),
        `allowlist should include "${required}" (used by discuss prompts)`,
      );
    }
  });

  test("DISCUSS_TOOLS_ALLOWLIST is significantly smaller than full tool set", () => {
    // Full set is 27 DB tools + dynamic + journal = 33+
    // Discuss set should be roughly 10 GSD tools (5 canonical + 5 aliases)
    assert.ok(
      DISCUSS_TOOLS_ALLOWLIST.length <= 12,
      `allowlist should have at most 12 GSD tools, got ${DISCUSS_TOOLS_ALLOWLIST.length}`,
    );
  });

  test("dispatchWorkflow scopes and restores tools for discuss unit types", async () => {
    const originalWorkflowPath = process.env.GSD_WORKFLOW_PATH;
    const tmp = mkdtempSync(join(tmpdir(), "gsd-discuss-tools-"));
    const workflowPath = join(tmp, "GSD-WORKFLOW.md");
    writeFileSync(workflowPath, "# Workflow\n");
    const setCalls: string[][] = [];
    const sent: unknown[] = [];
    let sentTools: string[] = [];
    let activeTools = ["gsd_summary_save", "gsd_complete_task", "bash"];
    process.env.GSD_WORKFLOW_PATH = workflowPath;
    try {
      await _dispatchWorkflowForTest(
        {
          getActiveTools: () => [...activeTools],
          setActiveTools: (tools: string[]) => {
            setCalls.push([...tools]);
            activeTools = [...tools];
          },
          sendMessage: (message: unknown) => {
            sent.push(message);
            sentTools = [...activeTools];
          },
        } as any,
        "Discuss the project",
        "gsd-run",
        undefined,
        "discuss-milestone",
      );
    } finally {
      if (originalWorkflowPath === undefined) delete process.env.GSD_WORKFLOW_PATH;
      else process.env.GSD_WORKFLOW_PATH = originalWorkflowPath;
      rmSync(tmp, { recursive: true, force: true });
    }

    assert.deepEqual(setCalls[0], ["gsd_summary_save", "bash"]);
    assert.deepEqual(setCalls.at(-1), ["gsd_summary_save", "gsd_complete_task", "bash"]);
    assert.ok(sentTools.length > 0, "dispatch should queue a message");
    assert.ok(sentTools.includes("gsd_summary_save"), "dispatch keeps the discuss save tool");
    assert.ok(!sentTools.includes("gsd_complete_task"), "dispatch removes heavy completion tools");
    assert.equal(sent.length, 1);
    assert.match(String((sent[0] as { content?: unknown }).content), /Discuss the project/);
  });
});
