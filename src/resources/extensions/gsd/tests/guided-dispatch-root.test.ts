// GSD-2 — Guided workflow dispatch project-root tests.
// Verifies smart entry dispatch uses the explicit project root instead of cwd.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  _dispatchWorkflowForTest,
  resolveGuidedDispatchProjectRoot,
} from "../guided-flow.ts";

test("guided dispatch falls back to cwd only when no project root is supplied", () => {
  const cwd = process.cwd();
  assert.equal(resolveGuidedDispatchProjectRoot(), cwd);
  assert.equal(resolveGuidedDispatchProjectRoot("/tmp/explicit-root"), "/tmp/explicit-root");
});

test("guided dispatch passes the explicit project root through model and compatibility checks", async () => {
  const explicitRoot = mkdtempSync(join(tmpdir(), "gsd-guided-root-explicit-"));
  const otherRoot = mkdtempSync(join(tmpdir(), "gsd-guided-root-cwd-"));
  const workflowPath = join(explicitRoot, "GSD-WORKFLOW.md");
  const originalWorkflowPath = process.env.GSD_WORKFLOW_PATH;
  const originalCwd = process.cwd();
  const seen = {
    prefsRoot: "",
    modelRoot: "",
    compatibilityRoot: "",
    sent: false,
  };

  const ctx = {
    model: { provider: "local-provider" },
    modelRegistry: {
      getProviderAuthMode: () => "apiKey",
    },
    ui: {
      notify: () => {},
    },
  };

  const pi = {
    getActiveTools: () => ["gsd_plan_slice"],
    setActiveTools: () => {},
    sendMessage: () => {
      seen.sent = true;
    },
  };

  try {
    writeFileSync(workflowPath, "# Workflow\n", "utf-8");
    process.env.GSD_WORKFLOW_PATH = workflowPath;
    process.chdir(otherRoot);

    await _dispatchWorkflowForTest(
      pi as any,
      "Plan the slice.",
      "gsd-run",
      ctx as any,
      "plan-slice",
      {
        basePath: explicitRoot,
        deps: {
          loadPreferences: (projectRoot?: string) => {
            seen.prefsRoot = projectRoot ?? "";
            return { preferences: {} } as any;
          },
          selectModel: async (
            _ctx: unknown,
            _pi: unknown,
            _unitType: string,
            _unitId: string,
            projectRoot: string,
          ) => {
            seen.modelRoot = projectRoot;
            return { routing: null, appliedModel: null };
          },
          getTransportSupportError: (
            _provider: string | undefined,
            _requiredTools: string[],
            options?: { projectRoot?: string },
          ) => {
            seen.compatibilityRoot = options?.projectRoot ?? "";
            return null;
          },
        },
      },
    );

    assert.equal(seen.prefsRoot, explicitRoot);
    assert.equal(seen.modelRoot, explicitRoot);
    assert.equal(seen.compatibilityRoot, explicitRoot);
    assert.equal(seen.sent, true);
  } finally {
    process.chdir(originalCwd);
    if (originalWorkflowPath === undefined) {
      delete process.env.GSD_WORKFLOW_PATH;
    } else {
      process.env.GSD_WORKFLOW_PATH = originalWorkflowPath;
    }
    rmSync(explicitRoot, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});
